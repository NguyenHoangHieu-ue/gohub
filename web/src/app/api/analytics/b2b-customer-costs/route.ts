import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { tursoQuery } from "@/lib/turso"
import { ensureB2bCostTable } from "@/lib/b2b-customer-cost"
import { flushAnalyticsCacheByPrefixes } from "@/lib/analytics-helpers"

// Lưu chi phí kênh nhập tay cho từng KH B2B theo tháng (batch upsert) — Turso.
// Body: { costs: [{ month, customer_code, cost_type, cost_value, cost_lines }] }

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !["admin", "creator"].includes(session.user.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

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

    // Xoá cache L1+L2 cho tất cả key qb2b_v4 của các quý bị ảnh hưởng.
    // Thiếu bước này → cache L2 (Supabase, TTL 12h) trả data cũ dù Turso đã lưu mới.
    const affectedPrefixes = [...new Set(rows.map(r => {
      const [y, m] = r.month.split("-")
      return `qb2b_v4:Q${Math.ceil(parseInt(m) / 3)}:${y}:`
    }))]
    flushAnalyticsCacheByPrefixes(affectedPrefixes).catch(() => { /* non-fatal */ })

    return NextResponse.json({ ok: true, saved, deleted })
  } catch (e: any) {
    console.error("[b2b-customer-costs POST]", e.message)
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 })
  }
}
