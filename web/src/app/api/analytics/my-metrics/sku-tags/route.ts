import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase"
import { queryAnalytics } from "@/lib/analytics-db"
import { canWriteTab } from "@/lib/writable-tabs"
import { parseQuarterLabel, isQuarterLocked, OKR_GM_BASELINE } from "@/lib/okr-helpers"

const READ_ROLES  = ["admin", "creator", "bod"]
const WRITE_ROLES = ["admin", "creator"]
const SKU_RE = /^[A-Za-z0-9_.-]{2,60}$/

interface PeriodStat { rev: number; gp: number; gm_pct: number; orders: number }

// SKU GM thật, tính từ đơn hàng THẬT gohub_dw trước/sau ngày áp dụng (effective_date) —
// KHÔNG cho nhập tay số margin, tránh tự khai khống. Sếp verify lại bằng cách tự chạy đúng SQL này.
async function computeSkuPeriods(skuCode: string, effectiveDate: string, qStart: string, qEnd: string) {
  const rows = await queryAnalytics<{ period: string; rev: string; gp: string; orders: string }>(
    `SELECT
       CASE WHEN fulfiled_date::date < $2::date THEN 'before' ELSE 'after' END AS period,
       SUM(fulfilled_revenue_amount_vnd)::bigint AS rev,
       SUM(gross_profit_vnd)::bigint             AS gp,
       COUNT(*)::bigint                          AS orders
     FROM fact_fulfillment_revenue
     WHERE TRIM(sku) = $1
       AND fulfiled_date IS NOT NULL
       AND fulfiled_date::date BETWEEN $3::date AND $4::date
       AND fulfiled_date::date <= CURRENT_DATE - 1
     GROUP BY 1`,
    [skuCode, effectiveDate, qStart, qEnd]
  )
  const mk = (r?: { rev: string; gp: string; orders: string }): PeriodStat => {
    const rev = Number(r?.rev) || 0
    const gp  = Number(r?.gp)  || 0
    return { rev, gp, gm_pct: rev > 0 ? +(gp / rev * 100).toFixed(2) : 0, orders: Number(r?.orders) || 0 }
  }
  return {
    before: mk(rows.find(r => r.period === "before")),
    after:  mk(rows.find(r => r.period === "after")),
  }
}

// GET ?quarter=Q3-2026
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", READ_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const quarter = req.nextUrl.searchParams.get("quarter") ?? "Q3-2026"
  const { start, end } = parseQuarterLabel(quarter)

  const { data: tags, error } = await supabaseAdmin
    .from("okr_sku_tags").select("*").eq("quarter", quarter).order("effective_date", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = tags ?? []
  const skuCodes = rows.map(r => r.sku_code)

  const [skuInfoRes, periodsArr] = await Promise.all([
    skuCodes.length > 0
      ? supabaseAdmin.from("skus").select("sku_code,status,latest_cogs,latest_cogs_currency").in("sku_code", skuCodes)
      : Promise.resolve({ data: [] as any[] }),
    Promise.all(rows.map(r => computeSkuPeriods(r.sku_code, r.effective_date, start, end).catch(() => null))),
  ])
  const skuInfoMap = new Map((skuInfoRes.data ?? []).map((s: any) => [s.sku_code, s]))

  const items = rows.map((r, i) => {
    const periods = periodsArr[i]
    const info = skuInfoMap.get(r.sku_code) ?? null
    if (!periods) {
      return { ...r, before: null, after: null, delta: null, delta_basis: null, status: "error", sku_info: info }
    }
    const { before, after } = periods
    let status: "new_sku" | "pending" | "verified" = "verified"
    let delta: number | null = null
    let delta_basis: string
    if (after.rev <= 0) {
      status = "pending"
      delta_basis = "Chưa có đơn hàng nào sau ngày áp dụng — chờ dữ liệu"
    } else if (before.rev <= 0) {
      status = "new_sku"
      delta = +(after.gm_pct - OKR_GM_BASELINE).toFixed(2)
      delta_basis = `SKU mới/chưa bán trước đó — so với baseline công ty ${OKR_GM_BASELINE}%`
    } else {
      delta = +(after.gm_pct - before.gm_pct).toFixed(2)
      delta_basis = "So chính SKU này trước vs sau ngày áp dụng"
    }
    return { ...r, before, after, delta, delta_basis, status, sku_info: info }
  })

  // Weighted-by-revenue aggregate delta — chỉ tính SKU đã có đủ dữ liệu (verified | new_sku)
  const withDelta = items.filter(i => i.delta !== null && i.after && i.after.rev > 0)
  const totalAfterRev = withDelta.reduce((a, i) => a + (i.after?.rev ?? 0), 0)
  const weightedDelta = totalAfterRev > 0
    ? +(withDelta.reduce((a, i) => a + (i.delta! * (i.after?.rev ?? 0)), 0) / totalAfterRev).toFixed(2)
    : null

  return NextResponse.json({
    quarter, start, end,
    items,
    weighted_delta: weightedDelta,
    total_after_rev: totalAfterRev,
    counted: withDelta.length,
    pending: items.filter(i => i.status === "pending").length,
    locked: isQuarterLocked(quarter),
  })
}

// POST — tag 1 SKU mới cho quý
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json() as {
    quarter: string; sku_code: string; note?: string; effective_date: string; evidence_image_url?: string
  }
  if (!body.quarter || !body.sku_code || !body.effective_date) {
    return NextResponse.json({ error: "quarter, sku_code, effective_date required" }, { status: 400 })
  }
  const skuCode = body.sku_code.trim().toUpperCase()
  if (!SKU_RE.test(skuCode)) return NextResponse.json({ error: "Mã SKU không hợp lệ" }, { status: 400 })
  if (isQuarterLocked(body.quarter)) {
    return NextResponse.json({ error: "Quý này đã đóng — không thể thêm SKU mới." }, { status: 403 })
  }

  const name = session.user.name ?? session.user.email ?? session.user.username
  const { error } = await supabaseAdmin.from("okr_sku_tags").upsert({
    quarter: body.quarter, sku_code: skuCode, note: body.note || null,
    effective_date: body.effective_date, evidence_image_url: body.evidence_image_url || null,
    created_by: name,
  }, { onConflict: "quarter,sku_code" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id=uuid
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await canWriteTab(session.user.username, "my-metrics", WRITE_ROLES)
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: rec } = await supabaseAdmin.from("okr_sku_tags").select("quarter").eq("id", id).maybeSingle()
  if (rec && isQuarterLocked(rec.quarter)) {
    return NextResponse.json({ error: "Quý này đã đóng — không thể xoá." }, { status: 403 })
  }

  const { error } = await supabaseAdmin.from("okr_sku_tags").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
