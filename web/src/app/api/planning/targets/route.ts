import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"

// ── Quarter helpers ─────────────────────────────────────────────────────────
function getQuarterMonths(quarter: string): string[] {
  const [year, q] = quarter.split("-Q").map(Number)
  const startMonth = (q - 1) * 3 + 1
  return [startMonth, startMonth + 1, startMonth + 2].map(
    m => `${year}-${String(m).padStart(2, "0")}`
  )
}

function getPreviousQuarter(quarter: string): string {
  const [year, q] = quarter.split("-Q").map(Number)
  if (q === 1) return `${year - 1}-Q4`
  return `${year}-Q${q - 1}`
}

// ── GET /api/planning/targets?quarter=2026-Q2 ───────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const quarter = req.nextUrl.searchParams.get("quarter") || ""
  if (!quarter) return NextResponse.json({ error: "quarter required" }, { status: 400 })

  try {
    const prevQuarter   = getPreviousQuarter(quarter)
    const prevMonths    = getQuarterMonths(prevQuarter)
    const currentMonths = getQuarterMonths(quarter)

    // Actuals từ gohub_dw cho prev quarter — gộp theo KÊNH (để CM1 trừ op-cost theo kênh giống intel),
    // kèm gross_profit_vnd (margin) cho CM1. grp = B2C/B2B để aggregate sau.
    const actualsRows = await queryAnalytics<{
      channel: string; grp: string; month: string; revenue: string; margin: string; revenue_3hk: string
    }>(
      `SELECT
         TRIM(s.channel_name) as channel,
         CASE WHEN UPPER(s.group_name) = 'B2C' THEN 'B2C' ELSE 'B2B' END as grp,
         TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') as month,
         SUM(f.fulfilled_revenue_amount_vnd) as revenue,
         SUM(f.gross_profit_vnd) as margin,
         SUM(CASE WHEN v.vendor ILIKE '3HKDATAPOOL' THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) as revenue_3hk
       FROM fact_fulfillment_revenue f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       LEFT JOIN dim_sku v ON f.sku = v.sku
       WHERE TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') IN ('${prevMonths.join("','")}')
       GROUP BY 1, 2, 3`
    )

    // Op-cost theo kênh/tháng (full-month, prevMonths đều là tháng đủ → không prorate, giống intel)
    const { data: ccData } = await supabaseAdmin
      .from("analytics_channel_costs")
      .select("channel, month, ads, platform_fee, sponsor_products, media")
      .in("month", prevMonths)
    const parseJson = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : (v || {}) } catch { return {} } }
    const channelCosts = (ccData || []).map((r: any) => ({
      channel: r.channel, month: String(r.month),
      ads: parseJson(r.ads), platformFee: parseJson(r.platform_fee), sponsorProducts: parseJson(r.sponsor_products), media: parseJson(r.media),
    }))

    // Saved targets từ Supabase. Defensive: cột target_gpm2 cần migration v18 — nếu chưa có thì đọc không kèm.
    let targetsRows: any[] = []
    try {
      const { data, error } = await supabaseAdmin
        .from("analytics_target_planning")
        .select("channel, month, target_revenue, target_3hk_contribution, target_gpm2")
        .in("month", currentMonths)
      if (error) throw error
      targetsRows = data || []
    } catch {
      const { data } = await supabaseAdmin
        .from("analytics_target_planning")
        .select("channel, month, target_revenue, target_3hk_contribution")
        .in("month", currentMonths)
      targetsRows = data || []
    }

    // Aggregate actuals theo grp_month: revenue, revenue_3hk, gpm2 (= margin − op-cost theo kênh)
    const aggRev: Record<string, number> = {}
    const agg3hk: Record<string, number> = {}
    const aggGpm2: Record<string, number> = {}
    actualsRows.forEach(r => {
      const revenue = parseFloat(r.revenue || "0")
      const margin = parseFloat(r.margin || "0")
      const rev3hk = parseFloat(r.revenue_3hk || "0")
      let gpm2 = margin
      channelCosts.filter(c => c.channel === r.channel && c.month === r.month).forEach(c => {
        ;(["ads", "platformFee", "sponsorProducts", "media"] as const).forEach(k => {
          const v = (c as any)[k]
          if (v) gpm2 -= v.type === "amount" ? (v.value || 0) : (revenue * (v.value || 0)) / 100
        })
      })
      const key = `${r.grp}_${r.month}`
      aggRev[key] = (aggRev[key] || 0) + revenue
      agg3hk[key] = (agg3hk[key] || 0) + rev3hk
      aggGpm2[key] = (aggGpm2[key] || 0) + gpm2
    })

    const targetsMap: Record<string, number> = {}
    const targets3hkMap: Record<string, number> = {}
    const targetsGpm2Map: Record<string, number> = {}
    targetsRows.forEach(r => {
      const key = `${r.channel}_${r.month}`
      targetsMap[key]     = r.target_revenue || 0
      targets3hkMap[key]  = r.target_3hk_contribution || 0
      targetsGpm2Map[key] = r.target_gpm2 || 0
    })

    // Build grouped data for B2C + B2B
    const data = ["B2C", "B2B"].map(group => {
      const prevQuarterActuals: Record<string, number>     = {}
      const prevQuarter3hkActuals: Record<string, number>  = {}
      const prevQuarterGpm2Actuals: Record<string, number> = {}
      const monthlyTargets: Record<string, number>         = {}
      const monthly3hkTargets: Record<string, number>      = {}
      const monthlyGpm2Targets: Record<string, number>     = {}

      prevMonths.forEach(m => {
        const key = `${group}_${m}`
        const rev = aggRev[key] || 0
        prevQuarterActuals[m] = rev
        prevQuarter3hkActuals[m]  = rev > 0 ? ((agg3hk[key] || 0) / rev) * 100 : 0
        prevQuarterGpm2Actuals[m] = rev > 0 ? ((aggGpm2[key] || 0) / rev) * 100 : 0
      })
      currentMonths.forEach(m => {
        const key = `${group}_${m}`
        monthlyTargets[m]     = targetsMap[key] || 0
        monthly3hkTargets[m]  = targets3hkMap[key] || 0
        monthlyGpm2Targets[m] = targetsGpm2Map[key] || 0
      })

      return { channel: group, group, prevQuarterActuals, prevQuarter3hkActuals, prevQuarterGpm2Actuals, monthlyTargets, monthly3hkTargets, monthlyGpm2Targets }
    })

    return NextResponse.json({ quarter, prevQuarter, prevMonths, currentMonths, data })
  } catch (err: any) {
    console.error("[planning/targets GET]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST /api/planning/targets ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["admin", "creator"].includes(session.user?.role as string)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { targets } = await req.json()
  if (!Array.isArray(targets) || !targets.length) {
    return NextResponse.json({ error: "targets array required" }, { status: 400 })
  }

  try {
    const rows = targets.map((t: {
      channel: string; month: string
      target_revenue?: number; target_3hk_contribution?: number; target_gpm2?: number
    }) => ({
      channel:                  t.channel,
      month:                    t.month,
      target_revenue:           t.target_revenue || 0,
      target_3hk_contribution:  t.target_3hk_contribution || 0,
      target_gpm2:              t.target_gpm2 || 0,
      updated_by:               session.user?.name || "system",
      updated_at:               new Date().toISOString(),
    }))

    const { error } = await supabaseAdmin
      .from("analytics_target_planning")
      .upsert(rows, { onConflict: "month,channel", ignoreDuplicates: false })

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("[planning/targets POST]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
