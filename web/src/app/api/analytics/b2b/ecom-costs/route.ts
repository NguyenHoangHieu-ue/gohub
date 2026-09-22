import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { tursoQuery } from "@/lib/turso"
import { ensureB2bEcomCostTable, ecomCostKey } from "@/lib/b2b-ecom-cost"
import { canWrite } from "@/lib/writable-tabs"
import { flushByDeps } from "@/lib/analytics-helpers"

const WRITE_ROLES = ["admin", "creator", "bod", "b2b", "b2c", "staff"]

// GET /api/analytics/b2b/ecom-costs?month=YYYY-MM
// Đọc chi phí VN Ecom (customer/shop/sub-shop) đã nhập — dùng để FE prefill modal edit.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator", "bod", "b2b"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const month = req.nextUrl.searchParams.get("month") || ""

  try {
    await ensureB2bEcomCostTable()
    let sql = "SELECT id, month, customer_name, shop_name, subshop_name, cost_type, cost_value, cost_lines, updated_by, updated_at FROM b2b_ecom_cost_monthly WHERE 1=1"
    const params: string[] = []
    if (month) { sql += " AND month = ?"; params.push(month) }
    sql += " ORDER BY month DESC LIMIT 500"

    const rows = await tursoQuery<{
      id: string; month: string; customer_name: string; shop_name: string; subshop_name: string
      cost_type: string; cost_value: number; cost_lines: string
      updated_by: string; updated_at: string
    }>(sql, params)

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        cost_lines_parsed: (() => { try { return JSON.parse(r.cost_lines) } catch { return [] } })(),
      })),
      total: rows.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/analytics/b2b/ecom-costs?id=<id>
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await canWrite(session, "b2b", WRITE_ROLES)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const id = req.nextUrl.searchParams.get("id") || ""
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  try {
    await tursoQuery("DELETE FROM b2b_ecom_cost_monthly WHERE id = ?", [id])
    await flushByDeps(["b2b-ecom-cost"]).catch(() => {})
    return NextResponse.json({ ok: true, deleted: id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/analytics/b2b/ecom-costs
// Body: { costs: [{ month, customer_name, shop_name, subshop_name, cost_lines }] } — batch upsert.
// Lưu Turso RIÊNG bảng b2b_ecom_cost_monthly (KHÔNG chung b2b_customer_cost_monthly — VN Ecom breakdown
// theo shop/sub-shop, không có customer_code cho từng cấp).
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await canWrite(session, "b2b", WRITE_ROLES)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const costs: any[] = Array.isArray(body?.costs) ? body.costs : []
    if (costs.length === 0)
      return NextResponse.json({ error: "Không có dòng chi phí nào để lưu" }, { status: 400 })

    const now = new Date().toISOString()
    const updatedBy = session.user.email || session.user.name || "unknown"

    const rows = costs.map((c: any) => {
      const month = String(c.month || "").trim()
      const customerName = String(c.customer_name || "").trim()
      const shopName = String(c.shop_name || "").trim()
      const subshopName = String(c.subshop_name || "").trim()
      if (!month || !customerName) return null
      let lines: any[] = []
      try { lines = typeof c.cost_lines === "string" ? JSON.parse(c.cost_lines) : (Array.isArray(c.cost_lines) ? c.cost_lines : []) } catch { lines = [] }
      const cleanLines = lines
        .map((l: any) => ({ label: String(l?.label ?? ""), type: l?.type === "percent" ? "percent" : "amount", value: Number(l?.value) || 0 }))
        .filter((l: any) => l.value !== 0 || l.label)
      const hasPct = cleanLines.some((l: any) => l.type === "percent")
      const cost_type = hasPct ? "percent" : "amount"
      const cost_value = hasPct
        ? cleanLines.filter((l: any) => l.type === "percent").reduce((s: number, l: any) => s + l.value, 0)
        : cleanLines.reduce((s: number, l: any) => s + l.value, 0)
      return {
        id: ecomCostKey(month, customerName, shopName, subshopName),
        month, customer_name: customerName, shop_name: shopName, subshop_name: subshopName,
        cost_type, cost_value,
        cost_lines: JSON.stringify(cleanLines),
        hasLines: cleanLines.length > 0,
        updated_by: updatedBy, updated_at: now,
      }
    }).filter(Boolean) as any[]

    if (rows.length === 0)
      return NextResponse.json({ error: "Dòng chi phí không hợp lệ" }, { status: 400 })

    await ensureB2bEcomCostTable()

    let deleted = 0
    for (const r of rows.filter(r => !r.hasLines)) {
      await tursoQuery("DELETE FROM b2b_ecom_cost_monthly WHERE id = ?", [r.id])
      deleted++
    }

    let saved = 0
    const saveRow = async (r: any) => {
      await tursoQuery(
        `INSERT INTO b2b_ecom_cost_monthly (id, month, customer_name, shop_name, subshop_name, cost_type, cost_value, cost_lines, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           cost_type    = excluded.cost_type,
           cost_value   = excluded.cost_value,
           cost_lines   = excluded.cost_lines,
           updated_by   = excluded.updated_by,
           updated_at   = excluded.updated_at`,
        [r.id, r.month, r.customer_name, r.shop_name, r.subshop_name, r.cost_type, r.cost_value, r.cost_lines, r.updated_by, r.updated_at],
      )
    }
    for (const r of rows.filter(r => r.hasLines)) {
      try {
        await saveRow(r)
      } catch (err: any) {
        if (err?.message?.includes("SQLITE_CONSTRAINT") || err?.message?.includes("no such column")) {
          await ensureB2bEcomCostTable(true)
          await saveRow(r)
        } else {
          throw err
        }
      }
      saved++
    }

    await flushByDeps(["b2b-ecom-cost"]).catch(() => {})
    return NextResponse.json({ ok: true, saved, deleted })
  } catch (e: any) {
    console.error("[b2b/ecom-costs POST]", e.message)
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 })
  }
}
