import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { tursoQuery } from "@/lib/turso"
import { ensureB2bCostTable } from "@/lib/b2b-customer-cost"
import { supabaseAdmin } from "@/lib/supabase"
import { canWrite } from "@/lib/writable-tabs"
import { flushB2BCostCaches } from "@/lib/analytics-helpers"

const WRITE_ROLES_DELETE = ["admin", "creator"]
const WRITE_ROLES_POST   = ["admin", "creator", "bod", "b2b", "b2c", "staff"]

// GET /api/analytics/b2b-customer-costs?month=YYYY-MM&customer_code=XXX
// Đọc costs từ Turso (và fallback Supabase nếu cần) — dùng để admin xem dữ liệu hiện tại.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !["admin", "creator", "bod"].includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const month = req.nextUrl.searchParams.get("month") || ""
  const customerCode = req.nextUrl.searchParams.get("customer_code") || ""

  try {
    await ensureB2bCostTable()

    let sql = "SELECT id, month, customer_code, cost_type, cost_value, cost_lines, updated_by, updated_at FROM b2b_customer_cost_monthly WHERE 1=1"
    const params: string[] = []
    if (month) { sql += " AND month = ?"; params.push(month) }
    if (customerCode) { sql += " AND customer_code = ?"; params.push(customerCode) }
    sql += " ORDER BY month DESC, customer_code LIMIT 500"

    const rows = await tursoQuery<{
      id: string; month: string; customer_code: string
      cost_type: string; cost_value: number; cost_lines: string
      updated_by: string; updated_at: string
    }>(sql, params)

    // Enrich với customer_name từ b2b_customers_cache (Supabase) nếu có
    const codes = [...new Set(rows.map(r => r.customer_code))]
    let nameMap: Record<string, string> = {}
    if (codes.length > 0) {
      const { data } = await supabaseAdmin
        .from("b2b_customers_cache")
        .select("customer_code, customer_name")
        .in("customer_code", codes)
      for (const r of data || []) nameMap[r.customer_code] = r.customer_name
    }

    return NextResponse.json({
      rows: rows.map(r => ({
        ...r,
        customer_name: nameMap[r.customer_code] || r.customer_code,
        cost_lines_parsed: (() => { try { return JSON.parse(r.cost_lines) } catch { return [] } })(),
      })),
      total: rows.length,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/analytics/b2b-customer-costs?id=<id>  → xóa 1 record cụ thể
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await canWrite(session, "quarterly", WRITE_ROLES_DELETE)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const id = req.nextUrl.searchParams.get("id") || ""
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  try {
    await tursoQuery("DELETE FROM b2b_customer_cost_monthly WHERE id = ?", [id])
    // Nhiều route (b2b/kpis|performance|trend, channels/kpis|performance, bod-summary|group-margin|
    // channel-performance, monthly-kpis, all-time-performance) cache KẾT QUẢ ĐÃ TÍNH SẴN với cost này
    // bên trong — xoá thẳng ID không tự làm số cũ trên các tab đó tươi lại (chỉ Quarter Report luôn fresh
    // vì fetchCustomerCosts nằm NGOÀI cachedQuery ở 2 route đó). Flush ĐÚNG PHẠM VI các route phụ thuộc cost
    // B2B — KHÔNG dùng flushAnalyticsCache() (xoá sạch mọi tab) để tránh nuke cache Products/Staff/Vendors/
    // Orders... không liên quan, làm cả app chậm hẳn mỗi lần sửa 1 dòng cost (sự cố thật gặp phải s169).
    await flushB2BCostCaches().catch(() => {})
    return NextResponse.json({ ok: true, deleted: id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/analytics/b2b-customer-costs?repair=1  → reconcile stale records
// POST /api/analytics/b2b-customer-costs  → upsert costs (existing behavior)

// Lưu chi phí kênh nhập tay cho từng KH B2B theo tháng (batch upsert) — Turso.
// Body: { costs: [{ month, customer_code, cost_type, cost_value, cost_lines }] }

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await canWrite(session, "quarterly", WRITE_ROLES_POST)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // Repair mode: đọc tất cả records, cross-check với b2b_customers_cache, báo stale records
    if (req.nextUrl.searchParams.get("repair") === "1") {
      await ensureB2bCostTable()
      const allRows = await tursoQuery<{ id: string; month: string; customer_code: string; cost_value: number }>(
        "SELECT id, month, customer_code, cost_value FROM b2b_customer_cost_monthly ORDER BY month DESC LIMIT 1000"
      )
      const codes = [...new Set(allRows.map(r => r.customer_code))]
      const { data: cached } = await supabaseAdmin
        .from("b2b_customers_cache")
        .select("customer_code")
        .in("customer_code", codes)
      const validCodes = new Set((cached || []).map((r: any) => r.customer_code))
      const stale = allRows.filter(r => !validCodes.has(r.customer_code))
      return NextResponse.json({
        total_records: allRows.length,
        valid_records: allRows.length - stale.length,
        stale_records: stale.length,
        stale: stale,
        note: "Stale = customer_code không còn trong b2b_customers_cache. Dùng DELETE endpoint để xóa từng record nếu cần.",
      })
    }

    const body = await req.json().catch(() => ({}))
    const costs: any[] = Array.isArray(body?.costs) ? body.costs : []
    if (costs.length === 0)
      return NextResponse.json({ error: "Không có dòng chi phí nào để lưu" }, { status: 400 })

    const now = new Date().toISOString()
    const updatedBy = session.user.email || session.user.name || "unknown"

    const rows = costs.map((c: any) => {
      const month = String(c.month || "").trim()
      const code = String(c.customer_code || "").trim()
      if (!month || !code) return null
      // cost_lines lưu JSON string; chuẩn hoá value/type
      let lines: any[] = []
      try { lines = typeof c.cost_lines === "string" ? JSON.parse(c.cost_lines) : (Array.isArray(c.cost_lines) ? c.cost_lines : []) } catch { lines = [] }
      const cleanLines = lines
        .map((l: any) => ({ label: String(l?.label ?? ""), type: l?.type === "percent" ? "percent" : "amount", value: Number(l?.value) || 0 }))
        .filter((l: any) => l.value !== 0 || l.label)
      // cost_type/cost_value gộp
      const hasPct = cleanLines.some((l: any) => l.type === "percent")
      const cost_type = hasPct ? "percent" : "amount"
      const cost_value = hasPct
        ? cleanLines.filter((l: any) => l.type === "percent").reduce((s: number, l: any) => s + l.value, 0)
        : cleanLines.reduce((s: number, l: any) => s + l.value, 0)
      return {
        id: `${month}_${code}`,
        month, customer_code: code,
        cost_type, cost_value,
        cost_lines: JSON.stringify(cleanLines),
        hasLines: cleanLines.length > 0,
        updated_by: updatedBy,
        updated_at: now,
      }
    }).filter(Boolean) as any[]

    if (rows.length === 0)
      return NextResponse.json({ error: "Dòng chi phí không hợp lệ" }, { status: 400 })

    // Đảm bảo bảng tồn tại trên Turso
    await ensureB2bCostTable()

    const deleteRows = rows.filter(r => !r.hasLines)
    const upsertRows = rows.filter(r => r.hasLines)

    let deleted = 0
    for (const r of deleteRows) {
      await tursoQuery("DELETE FROM b2b_customer_cost_monthly WHERE id = ?", [r.id])
      deleted++
    }

    let saved = 0
    const saveRow = async (r: any) => {
      await tursoQuery(
        `INSERT INTO b2b_customer_cost_monthly (id, month, customer_code, cost_type, cost_value, cost_lines, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           cost_type    = excluded.cost_type,
           cost_value   = excluded.cost_value,
           cost_lines   = excluded.cost_lines,
           updated_by   = excluded.updated_by,
           updated_at   = excluded.updated_at`,
        [r.id, r.month, r.customer_code, r.cost_type, r.cost_value, r.cost_lines, r.updated_by, r.updated_at],
      )
    }

    for (const r of upsertRows) {
      try {
        await saveRow(r)
      } catch (err: any) {
        // Nếu schema cũ trên Turso gây lỗi constraint (vd: thiếu/thừa cột cũ), recreate bảng & retry
        if (err?.message?.includes("SQLITE_CONSTRAINT") || err?.message?.includes("no such column")) {
          await ensureB2bCostTable(true)
          await saveRow(r)
        } else {
          throw err
        }
      }
      saved++
    }

    // Root cause s169 (2026-08-28): route này TRƯỚC KHÔNG flush cache nào — trong khi channel-costs/
    // channel-group-costs (Supabase) đã flushAnalyticsCache() từ lâu. Kết quả: sửa CH.Cost per-customer
    // (Turso, qua modal "Sửa chi tiết" ở Quarter Report) không phản ánh ngay ở B2B Performance/Channels/
    // BOD/Dashboard/All-Time — các tab đó cache CẢ khối kết quả đã tính (gồm cost) tới 12h, chỉ Quarter
    // Report tự tươi vì code ở đó cố ý đặt fetchCustomerCosts NGOÀI cachedQuery. Flush ĐÚNG PHẠM VI —
    // s169(b): flushAnalyticsCache() (xoá sạch) gây cả app chậm hẳn mỗi lần sửa cost (nuke luôn cache
    // Products/Staff/Vendors/Orders... không liên quan) khi Hiếu sửa/reload nhiều lần liên tục lúc test.
    await flushB2BCostCaches().catch(() => {})
    return NextResponse.json({ ok: true, saved, deleted })
  } catch (e: any) {
    console.error("[b2b-customer-costs POST]", e.message)
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 })
  }
}
