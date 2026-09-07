import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { tursoQuery } from "@/lib/turso"
import { supabaseAdmin } from "@/lib/supabase"
import { ensureB2bCostTable } from "@/lib/b2b-customer-cost"
import { canWrite } from "@/lib/writable-tabs"
import { flushByDeps } from "@/lib/analytics-helpers"

const WRITE_ROLES = ["admin", "creator"]

// ─── DELETE: Xóa records tạo nhầm (customer_code chứa ký tự < > là placeholder) ──────────────
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "quarterly", WRITE_ROLES)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await ensureB2bCostTable()
  const wrongRecords = await tursoQuery<{ id: string; customer_code: string; month: string }>(
    `SELECT id, customer_code, month FROM b2b_customer_cost_monthly
     WHERE customer_code LIKE '%<%' OR customer_code LIKE '%>%'`
  )
  if (wrongRecords.length === 0)
    return NextResponse.json({ deleted: 0, message: "Không có records sai để xóa" })

  const deleted: string[] = []
  for (const r of wrongRecords) {
    await tursoQuery("DELETE FROM b2b_customer_cost_monthly WHERE id = ?", [r.id])
    deleted.push(r.id)
  }
  await flushByDeps(["b2b-cost"]).catch(() => {})
  return NextResponse.json({ deleted: deleted.length, ids: deleted })
}

// ─── GET: Chẩn đoán + auto-suggest mapping cho stale codes ─────────────────────────────────────
// ?autofix=1 → tự động migrate những case có 1 match chắc chắn (không cần confirm)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "quarterly", WRITE_ROLES)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const autofix = req.nextUrl.searchParams.get("autofix") === "1"

  await ensureB2bCostTable()

  // 1. Lấy tất cả unique customer_code trong Turso
  const tursoRows = await tursoQuery<{ customer_code: string; months: string; total_months: number }>(
    `SELECT customer_code,
            GROUP_CONCAT(month, ',') as months,
            COUNT(*) as total_months
     FROM b2b_customer_cost_monthly
     WHERE customer_code NOT LIKE '%<%' AND customer_code NOT LIKE '%>%'
     GROUP BY customer_code
     ORDER BY customer_code`
  )
  const tursoCodes = tursoRows.map(r => r.customer_code)

  // 2. Lấy b2b_customers_cache — customers có revenue thật
  const { data: cacheAll } = await supabaseAdmin
    .from("b2b_customers_cache")
    .select("customer_code, customer_name, price_list_name, total_revenue")
    .order("total_revenue", { ascending: false })
    .limit(500)
  const cache = cacheAll || []
  const cacheByCode = new Map(cache.map(r => [r.customer_code, r]))

  // 3. Phân loại: stale (không có trong cache hoặc revenue=0) vs ok
  const stale: Array<{
    customer_code: string; months: string[]; suggestions: typeof cache
  }> = []
  const ok: string[] = []

  for (const r of tursoRows) {
    const cached = cacheByCode.get(r.customer_code)
    if (cached && cached.total_revenue > 0) {
      ok.push(r.customer_code); continue
    }

    // Stale: tìm suggestions bằng name similarity
    // Lấy tên từ dim_customer nếu có
    let displayName = r.customer_code
    try {
      const rows = await queryAnalytics<{ name: string }>(
        `SELECT COALESCE(name,'') as name FROM dim_customer WHERE code = $1 LIMIT 1`,
        [r.customer_code]
      )
      if (rows[0]?.name) displayName = rows[0].name
    } catch {}

    // Tìm candidates: score bằng word overlap giữa displayName và customer_name trong cache
    const words = displayName.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2)
    const scored = cache
      .filter(c => c.total_revenue > 0)
      .map(c => {
        const cn = c.customer_name.toLowerCase()
        const matchCount = words.filter(w => cn.includes(w)).length
        return { ...c, score: matchCount }
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score || b.total_revenue - a.total_revenue)
      .slice(0, 3)

    stale.push({
      customer_code: r.customer_code,
      months: r.months.split(","),
      suggestions: scored,
    })
  }

  // 4. Nếu autofix=1: tự migrate những stale có đúng 1 suggestion score >= 1
  const autofixed: Array<{ from: string; to: string; created: string[] }> = []
  if (autofix) {
    const now = new Date().toISOString()
    const updatedBy = session.user.email || session.user.name || "autofix"
    for (const s of stale) {
      if (s.suggestions.length !== 1) continue // bỏ qua nếu ambiguous hoặc không có match
      const realCode = s.suggestions[0].customer_code
      const created: string[] = []

      // Lấy cost data từ Turso cho customer_code này
      const virtualRows = await tursoQuery<{
        id: string; month: string; cost_type: string; cost_value: number; cost_lines: string
      }>(
        `SELECT id, month, cost_type, cost_value, cost_lines
         FROM b2b_customer_cost_monthly
         WHERE customer_code = ?`,
        [s.customer_code]
      )
      for (const row of virtualRows) {
        const newId = `${row.month}_${realCode}`
        const existing = await tursoQuery<{ id: string }>(
          "SELECT id FROM b2b_customer_cost_monthly WHERE id = ?", [newId]
        )
        if (existing.length > 0) continue
        await tursoQuery(
          `INSERT INTO b2b_customer_cost_monthly
             (id, month, customer_code, cost_type, cost_value, cost_lines, updated_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [newId, row.month, realCode, row.cost_type, row.cost_value, row.cost_lines, updatedBy, now]
        )
        created.push(newId)
      }
      if (created.length > 0) autofixed.push({ from: s.customer_code, to: realCode, created })
    }
    if (autofixed.length > 0) await flushByDeps(["b2b-cost"]).catch(() => {})
  }

  return NextResponse.json({
    summary: { total_codes: tursoCodes.length, ok: ok.length, stale: stale.length },
    stale_codes: stale.map(s => ({
      customer_code: s.customer_code,
      months: s.months,
      suggestions: s.suggestions.map(c => ({
        customer_code: c.customer_code,
        customer_name: c.customer_name,
        price_list_name: c.price_list_name,
        total_revenue: c.total_revenue,
      })),
      auto_migrate: s.suggestions.length === 1 ? "YES (1 confident match)" : `MANUAL (${s.suggestions.length} candidates)`,
    })),
    ...(autofix ? { autofixed } : {}),
    tip: autofix
      ? "Autofix completed. Với stale codes có >1 candidate, gọi POST để map thủ công."
      : "Gọi GET?autofix=1 để tự động migrate những case có 1 match chắc chắn. POST để map thủ công.",
  })
}

// ─── POST: Map thủ công virtual→real hoặc autofix tất cả ───────────────────────────────────────
// Body: { mappings: [{ virtual_code, real_code, months? }] }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !(await canWrite(session, "quarterly", WRITE_ROLES)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const mappings: Array<{ virtual_code: string; real_code: string; months?: string[] }> =
    Array.isArray(body?.mappings) ? body.mappings : []

  if (mappings.length === 0)
    return NextResponse.json({ error: "mappings required: [{ virtual_code, real_code, months? }]" }, { status: 400 })

  await ensureB2bCostTable()
  const now = new Date().toISOString()
  const updatedBy = session.user.email || session.user.name || "fix-script"
  const created: string[] = []
  const skipped: string[] = []

  for (const m of mappings) {
    const whereMonths = m.months && m.months.length > 0
      ? `AND month IN (${m.months.map(() => "?").join(",")})` : ""
    const params = m.months && m.months.length > 0 ? [m.virtual_code, ...m.months] : [m.virtual_code]

    const virtualRows = await tursoQuery<{
      id: string; month: string; cost_type: string; cost_value: number; cost_lines: string
    }>(
      `SELECT id, month, cost_type, cost_value, cost_lines
       FROM b2b_customer_cost_monthly
       WHERE customer_code = ? ${whereMonths}`,
      params
    )
    for (const row of virtualRows) {
      const newId = `${row.month}_${m.real_code}`
      const existing = await tursoQuery<{ id: string }>(
        "SELECT id FROM b2b_customer_cost_monthly WHERE id = ?", [newId]
      )
      if (existing.length > 0) { skipped.push(newId); continue }
      await tursoQuery(
        `INSERT INTO b2b_customer_cost_monthly
           (id, month, customer_code, cost_type, cost_value, cost_lines, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, row.month, m.real_code, row.cost_type, row.cost_value, row.cost_lines, updatedBy, now]
      )
      created.push(newId)
    }
  }

  if (created.length > 0) await flushByDeps(["b2b-cost"]).catch(() => {})
  return NextResponse.json({
    created, skipped,
    note: "Virtual records giữ nguyên. Records mới với real_code đã được tạo.",
  })
}
