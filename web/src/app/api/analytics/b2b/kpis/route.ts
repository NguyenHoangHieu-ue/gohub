import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, getPrevDateFilter,
  getMonthsInRange, getChannelCostsForMonths, getDaysInRange, getDaysInMonth,
  CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache,
} from "@/lib/analytics-helpers"
import { supabaseAdmin } from "@/lib/supabase"

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate      = searchParams.get("startDate")
  const endDate        = searchParams.get("endDate")
  const dateColumn     = searchParams.get("dateColumn")     || "fulfiled_date"
  const comparisonType = searchParams.get("comparisonType") || "none"

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter = getPrevDateFilter(startDate, endDate, comparisonType, source.dateCol)

  try {
    const key = `b2b-kpis:${dateColumn}:${startDate}:${endDate}:${comparisonType}`
    const payload = await cachedQuery(key, async () => {
    const [main, channelRows] = await Promise.all([
      queryAnalytics<Record<string, string>>(
        `WITH current_period AS (
           SELECT SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.marginCol}) as margin, COUNT(DISTINCT f.order_code) as orders
           FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2B' AND ${filter}
         ),
         previous_period AS (
           SELECT SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.marginCol}) as margin, COUNT(DISTINCT f.order_code) as orders
           FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2B' AND ${prevFilter}
         )
         SELECT c.revenue as current_revenue, p.revenue as prev_revenue,
                c.margin as current_margin, p.margin as prev_margin,
                c.orders as current_orders, p.orders as prev_orders
         FROM current_period c, previous_period p`
      ),
      queryAnalytics<Record<string, string>>(
        `SELECT TRIM(s.channel_name) as channel,
                TO_CHAR(f.${source.dateCol}::DATE, 'YYYY-MM') as month,
                SUM(CASE WHEN ${filter} THEN f.${source.revenueCol} ELSE 0 END) as current_revenue,
                SUM(CASE WHEN ${prevFilter} THEN f.${source.revenueCol} ELSE 0 END) as prev_revenue
         FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2B' AND (${filter} OR ${prevFilter})
         GROUP BY TRIM(s.channel_name), month`
      ),
    ])

    const m = main[0] || {}

    // ── Operational cost (CM1) computation, pro-rata by days-in-range ──────────
    const start = new Date(startDate || new Date().toISOString().split("T")[0])
    const end   = new Date(endDate   || new Date().toISOString().split("T")[0])
    const duration  = end.getTime() - start.getTime()
    const prevStart = new Date(start.getTime() - duration - 86400000)
    const prevEnd   = new Date(start.getTime() - 86400000)

    const currentMonths = getMonthsInRange(start.toISOString().split("T")[0], end.toISOString().split("T")[0])
    const prevMonths    = getMonthsInRange(prevStart.toISOString().split("T")[0], prevEnd.toISOString().split("T")[0])
    const allMonths     = Array.from(new Set([...currentMonths, ...prevMonths]))

    let totalOpCost = 0
    let prevTotalOpCost = 0

    if (allMonths.length > 0) {
      const pStartString = prevStart.toISOString().split("T")[0]
      const pEndString   = prevEnd.toISOString().split("T")[0]

      // 1. Per-channel costs (analytics_channel_costs)
      const channelCosts = await getChannelCostsForMonths(allMonths)
      channelRows.forEach(row => {
        const ch = row.channel
        const mo = row.month
        const cRev = parseFloat(row.current_revenue || "0")
        const pRev = parseFloat(row.prev_revenue || "0")

        if (currentMonths.includes(mo)) {
          channelCosts.filter(c => c.channel === ch && c.month === mo).forEach(c => {
            const ratio = getDaysInMonth(mo) > 0 ? getDaysInRange(startDate!, endDate!, mo) / getDaysInMonth(mo) : 0
            COST_KEYS.forEach(key => {
              const cv = c[key]
              if (cv) totalOpCost += cv.type === "amount" ? (cv.value || 0) * ratio : (cRev * (cv.value || 0)) / 100
            })
          })
        }
        if (prevMonths.includes(mo)) {
          channelCosts.filter(c => c.channel === ch && c.month === mo).forEach(c => {
            const ratio = getDaysInMonth(mo) > 0 ? getDaysInRange(pStartString, pEndString, mo) / getDaysInMonth(mo) : 0
            COST_KEYS.forEach(key => {
              const cv = c[key]
              if (cv) prevTotalOpCost += cv.type === "amount" ? (cv.value || 0) * ratio : (pRev * (cv.value || 0)) / 100
            })
          })
        }
      })

      // 2. B2B group-level costs (analytics_channel_group_costs, group_name = 'B2B')
      //    — đây là lý do CM1 = Gross Profit khi không có per-channel costs
      const { data: gcData } = await supabaseAdmin
        .from("analytics_channel_group_costs")
        .select("month, amount")
        .eq("group_name", "B2B")
        .in("month", allMonths)
      for (const gc of gcData || []) {
        const mo = String(gc.month)
        const amt = parseFloat(gc.amount || "0")
        if (currentMonths.includes(mo)) {
          const ratio = getDaysInMonth(mo) > 0 ? getDaysInRange(startDate!, endDate!, mo) / getDaysInMonth(mo) : 0
          totalOpCost += amt * ratio
        }
        if (prevMonths.includes(mo)) {
          const ratio = getDaysInMonth(mo) > 0 ? getDaysInRange(pStartString, pEndString, mo) / getDaysInMonth(mo) : 0
          prevTotalOpCost += amt * ratio
        }
      }
    }

    const cRev = parseFloat(m.current_revenue || "0")
    const pRev = parseFloat(m.prev_revenue    || "0")
    const cMar = parseFloat(m.current_margin  || "0")
    const pMar = parseFloat(m.prev_margin     || "0")
    const cOrd = parseInt(m.current_orders    || "0")
    const pOrd = parseInt(m.prev_orders       || "0")
    const cGpm2 = cMar - totalOpCost
    const pGpm2 = pMar - prevTotalOpCost
    const pct  = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100

    return [
      { label: "Total Revenue",  value: cRev, lastPeriod: pRev, change: pct(cRev, pRev), isPositive: cRev >= pRev, isCurrency: true  },
      { label: "Gross Profit",   value: cMar, lastPeriod: pMar, change: pct(cMar, pMar), isPositive: cMar >= pMar, isCurrency: true  },
      { label: "Margin %",       value: cRev > 0 ? (cMar/cRev)*100 : 0, lastPeriod: pRev > 0 ? (pMar/pRev)*100 : 0, change: (cRev > 0 ? (cMar/cRev)*100 : 0) - (pRev > 0 ? (pMar/pRev)*100 : 0), isPositive: (cRev > 0 ? (cMar/cRev)*100 : 0) >= (pRev > 0 ? (pMar/pRev)*100 : 0), isCurrency: false },
      { label: "Total Orders",   value: cOrd, lastPeriod: pOrd, change: pct(cOrd, pOrd), isPositive: cOrd >= pOrd, isCurrency: false },
      { label: "CM1",           value: cGpm2, lastPeriod: pGpm2, change: pct(cGpm2, pGpm2), isPositive: cGpm2 >= pGpm2, isCurrency: true  },
      { label: "CM1 %",         value: cRev > 0 ? (cGpm2/cRev)*100 : 0, lastPeriod: pRev > 0 ? (pGpm2/pRev)*100 : 0, change: (cRev > 0 ? (cGpm2/cRev)*100 : 0) - (pRev > 0 ? (pGpm2/pRev)*100 : 0), isPositive: (cRev > 0 ? (cGpm2/cRev)*100 : 0) >= (pRev > 0 ? (pGpm2/pRev)*100 : 0), isCurrency: false },
    ]
    }, QUERY_TTL_MIN, noCache(req))

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2b/kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
