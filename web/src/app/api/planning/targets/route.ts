import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { getStrategicPartnersList } from "@/lib/analytics-helpers"

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

    const strategicList = await getStrategicPartnersList()

    // Actuals from gohub_dw for prev quarter (B2B vs B2C split)
    const actualsRows = await queryAnalytics<{
      group_name: string; month: string; revenue: string; revenue_3hk: string
    }>(
      `SELECT
         CASE WHEN UPPER(s.group_name) = 'B2C' THEN 'B2C' ELSE 'B2B' END as group_name,
         TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') as month,
         SUM(f.fulfilled_revenue_amount_vnd) as revenue,
         SUM(CASE WHEN v.vendor ILIKE '3HKDATAPOOL' THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) as revenue_3hk
       FROM fact_fulfillment_revenue f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       LEFT JOIN dim_sku v ON f.sku = v.sku
       WHERE TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') IN ('${prevMonths.join("','")}')
       GROUP BY 1, 2`
    )

    // Saved targets from Supabase
    const { data: targetsRows } = await supabaseAdmin
      .from("analytics_target_planning")
      .select("channel, month, target_revenue, target_3hk_contribution, target_unit")
      .in("month", currentMonths)

    // Build lookup maps
    const actualsMap: Record<string, number> = {}
    const actuals3hkMap: Record<string, number> = {}
    actualsRows.forEach(r => {
      const key = `${r.group_name}_${r.month}`
      actualsMap[key] = (actualsMap[key] || 0) + parseFloat(r.revenue || "0")
      actuals3hkMap[key] = (actuals3hkMap[key] || 0) + parseFloat(r.revenue_3hk || "0")
    })

    const targetsMap: Record<string, number> = {}
    const targets3hkMap: Record<string, number> = {}
    const targetsUnitMap: Record<string, number> = {}
    ;(targetsRows || []).forEach(r => {
      const key = `${r.channel}_${r.month}`
      targetsMap[key]     = r.target_revenue || 0
      targets3hkMap[key]  = r.target_3hk_contribution || 0
      targetsUnitMap[key] = r.target_unit || 0
    })

    // Build grouped data for B2C + B2B
    const data = ["B2C", "B2B"].map(group => {
      const prevQuarterActuals: Record<string, number> = {}
      const prevQuarter3hkActuals: Record<string, number> = {}
      const monthlyTargets: Record<string, number>       = {}
      const monthly3hkTargets: Record<string, number>    = {}
      const monthlyUnitTargets: Record<string, number>   = {}

      prevMonths.forEach(m => {
        const key = `${group}_${m}`
        const rev = actualsMap[key] || 0
        const rev3hk = actuals3hkMap[key] || 0
        prevQuarterActuals[m] = rev
        prevQuarter3hkActuals[m] = rev > 0 ? (rev3hk / rev) * 100 : 0
      })
      currentMonths.forEach(m => {
        const key = `${group}_${m}`
        monthlyTargets[m]    = targetsMap[key] || 0
        monthly3hkTargets[m] = targets3hkMap[key] || 0
        monthlyUnitTargets[m]= targetsUnitMap[key] || 0
      })

      return { channel: group, group, prevQuarterActuals, prevQuarter3hkActuals, monthlyTargets, monthly3hkTargets, monthlyUnitTargets }
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
  if (session.user?.role !== "admin" && session.user?.role !== "manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { targets } = await req.json()
  if (!Array.isArray(targets) || !targets.length) {
    return NextResponse.json({ error: "targets array required" }, { status: 400 })
  }

  try {
    const rows = targets.map((t: {
      channel: string; month: string
      target_revenue?: number; target_3hk_contribution?: number; target_unit?: number
    }) => ({
      channel:                  t.channel,
      month:                    t.month,
      target_revenue:           t.target_revenue || 0,
      target_3hk_contribution:  t.target_3hk_contribution || 0,
      target_unit:              t.target_unit || 0,
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
