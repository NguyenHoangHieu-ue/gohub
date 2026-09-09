import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter, getBODFilters, shipFilter, internalOpsFilter, excludeOpsByCode, getMonthsInRange, getDaysInRange, getDaysInMonth, getChannelCostsForMonths, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache } from "@/lib/analytics-helpers"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { COST_KEYS } from "@/lib/analytics-engine/cost-engine"

// Port intel /api/analytics/b2c/kpis: 7 KPI [Revenue, Units, Gross Profit, Margin %, Total Orders, CM1, CM1 %].
// CM1 = margin − operational cost (channel_costs ads/platform/sponsor/media + group_costs B2C), prorate theo ngày.
// Cost lấy từ Supabase analytics_channel_costs / analytics_channel_group_costs (đã có từ Channels).

const B2C_FILTER = "UPPER(s.group_name) = 'B2C'"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate      = searchParams.get("startDate")
  const endDate        = searchParams.get("endDate")
  const comparisonType = searchParams.get("comparisonType") || "none"
  const dateColumn     = searchParams.get("dateColumn") || "fulfiled_date"
  const includeShip        = searchParams.get("includeShip")        === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"
  const includeOpsCustomers = searchParams.get("includeOpsCustomers") === "1"
  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })

  const source         = getAnalyticsSource(dateColumn)
  const filter         = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter     = getPrevDateFilter(startDate, endDate, comparisonType, source.dateCol)
  const advancedFilter = getBODFilters(searchParams)

  try {
    const { excludedCustomers } = includeOpsCustomers ? { excludedCustomers: [] } : await fetchQuarterlySettings()
    const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)} ${excludeOpsByCode(excludedCustomers)}`
    const key = `b2c-kpis:${dateColumn}:${startDate}:${endDate}:${comparisonType}:${advancedFilter}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${includeOpsCustomers ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
    const [aggRows, channelRows] = await Promise.all([
      queryAnalytics<Record<string, string>>(
        `WITH current_period AS (
           SELECT SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.marginCol}) as margin,
                  COUNT(DISTINCT f.order_code) as orders, SUM(f.${source.quantityCol}) as units
           FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE ${B2C_FILTER} AND ${filter} ${advancedFilter} ${sfx}
         ),
         previous_period AS (
           SELECT SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.marginCol}) as margin,
                  COUNT(DISTINCT f.order_code) as orders, SUM(f.${source.quantityCol}) as units
           FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE ${B2C_FILTER} AND ${prevFilter} ${advancedFilter} ${sfx}
         )
         SELECT c.revenue as current_revenue, p.revenue as prev_revenue,
                c.margin as current_margin, p.margin as prev_margin,
                c.orders as current_orders, p.orders as prev_orders,
                c.units as current_units, p.units as prev_units
         FROM current_period c, previous_period p`
      ),
      // Revenue theo channel (current/prev) cho phân bổ cost theo %
      queryAnalytics<Record<string, string>>(
        `SELECT TRIM(s.channel_name) as channel,
                SUM(CASE WHEN ${filter} THEN f.${source.revenueCol} ELSE 0 END) as current_revenue,
                SUM(CASE WHEN ${prevFilter} THEN f.${source.revenueCol} ELSE 0 END) as prev_revenue
         FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${B2C_FILTER} AND (${filter} OR ${prevFilter}) ${advancedFilter} ${sfx}
         GROUP BY 1`
      ),
    ])

    // Khoảng tháng hiện tại + kỳ trước (cho cost)
    const start = new Date(startDate)
    const end = new Date(endDate)
    const duration = end.getTime() - start.getTime()
    const prevStart = new Date(start.getTime() - duration - 86400000)
    const prevEnd = new Date(start.getTime() - 86400000)
    const pStartStr = prevStart.toISOString().split("T")[0]
    const pEndStr = prevEnd.toISOString().split("T")[0]
    const currentMonths = getMonthsInRange(startDate, endDate)
    const prevMonths = getMonthsInRange(pStartStr, pEndStr)
    const allMonths = Array.from(new Set([...currentMonths, ...prevMonths]))

    let totalOpCost = 0, prevTotalOpCost = 0
    if (allMonths.length > 0) {
      const [channelCosts, { data: gcData }] = await Promise.all([
        getChannelCostsForMonths(allMonths),
        supabaseAdmin.from("analytics_channel_group_costs").select("month, amount").eq("group_name", "B2C").in("month", allMonths),
      ])

      channelRows.forEach(row => {
        const apply = (months: string[], rangeStart: string, rangeEnd: string, rev: number, add: (v: number) => void) => {
          channelCosts.filter((c: any) => c.channel === row.channel && months.includes(String(c.month))).forEach((c: any) => {
            const ratio = getDaysInMonth(String(c.month)) > 0 ? getDaysInRange(rangeStart, rangeEnd, String(c.month)) / getDaysInMonth(String(c.month)) : 0
            COST_KEYS.forEach(key => {
              const v = c[key]
              // amount: pro-rata theo số ngày trong kỳ (× ratio). percent: áp thẳng trên revenue của kỳ (rev đã
              // là doanh thu range) — KHÔNG × ratio (nhất quán bod-data.ts; B2C-1 s126: trước nhân dư → under-count kỳ lẻ tháng).
              if (v) add(v.type === "amount" ? (v.value || 0) * ratio : (rev * (v.value || 0)) / 100)
            })
          })
        }
        apply(currentMonths, startDate, endDate, parseFloat(row.current_revenue || "0"), v => { totalOpCost += v })
        apply(prevMonths, pStartStr, pEndStr, parseFloat(row.prev_revenue || "0"), v => { prevTotalOpCost += v })
      })

      // Group-level B2C costs
      ;(gcData || []).forEach((r: any) => {
        const month = String(r.month)
        const amount = parseFloat(r.amount || "0")
        if (currentMonths.includes(month)) {
          const ratio = getDaysInMonth(month) > 0 ? getDaysInRange(startDate, endDate, month) / getDaysInMonth(month) : 0
          totalOpCost += amount * ratio
        }
        if (prevMonths.includes(month)) {
          const ratio = getDaysInMonth(month) > 0 ? getDaysInRange(pStartStr, pEndStr, month) / getDaysInMonth(month) : 0
          prevTotalOpCost += amount * ratio
        }
      })
    }

    const d = aggRows[0] || {}
    const current_revenue = parseFloat(d.current_revenue || "0")
    const prev_revenue    = parseFloat(d.prev_revenue || "0")
    const current_margin  = parseFloat(d.current_margin || "0")
    const prev_margin     = parseFloat(d.prev_margin || "0")
    const current_gpm2    = current_margin - totalOpCost
    const prev_gpm2       = prev_margin - prevTotalOpCost
    const current_gpm2_percent = current_revenue > 0 ? (current_gpm2 / current_revenue) * 100 : 0
    const prev_gpm2_percent    = prev_revenue > 0 ? (prev_gpm2 / prev_revenue) * 100 : 0
    const currentMarginPercent = current_revenue > 0 ? (current_margin / current_revenue) * 100 : 0
    const prevMarginPercent    = prev_revenue > 0 ? (prev_margin / prev_revenue) * 100 : 0
    const chg = (curr: number, prev: number) => (!prev || prev === 0) ? 0 : ((curr - prev) / prev) * 100

    return [
      { label: "Total Revenue", value: current_revenue, lastPeriod: prev_revenue, change: chg(current_revenue, prev_revenue), isPositive: current_revenue >= prev_revenue, isCurrency: true },
      { label: "Units Sold", value: parseFloat(d.current_units || "0"), lastPeriod: parseFloat(d.prev_units || "0"), change: chg(parseFloat(d.current_units || "0"), parseFloat(d.prev_units || "0")), isPositive: parseFloat(d.current_units || "0") >= parseFloat(d.prev_units || "0"), isCurrency: false },
      { label: "Gross Profit", value: current_margin, lastPeriod: prev_margin, change: chg(current_margin, prev_margin), isPositive: current_margin >= prev_margin, isCurrency: true },
      { label: "Margin %", value: currentMarginPercent, lastPeriod: prevMarginPercent, change: currentMarginPercent - prevMarginPercent, isPositive: currentMarginPercent >= prevMarginPercent, isCurrency: false },
      { label: "Total Orders", value: parseInt(d.current_orders || "0"), lastPeriod: parseInt(d.prev_orders || "0"), change: chg(parseInt(d.current_orders || "0"), parseInt(d.prev_orders || "0")), isPositive: parseInt(d.current_orders || "0") >= parseInt(d.prev_orders || "0"), isCurrency: false },
      { label: "CM1", value: current_gpm2, lastPeriod: prev_gpm2, change: chg(current_gpm2, prev_gpm2), isPositive: current_gpm2 >= prev_gpm2, isCurrency: true },
      { label: "CM1 %", value: current_gpm2_percent, lastPeriod: prev_gpm2_percent, change: current_gpm2_percent - prev_gpm2_percent, isPositive: current_gpm2_percent >= prev_gpm2_percent, isCurrency: false },
    ]
    }, QUERY_TTL_MIN, noCache(req))

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2c/kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
