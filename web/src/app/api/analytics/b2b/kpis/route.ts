import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, getPrevDateFilter,
  getMonthsInRange, getDaysInRange, getDaysInMonth,
  shipFilter, internalOpsFilter, excludeOpsByCode, excludeInactiveCustomers,
  CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache,
} from "@/lib/analytics-helpers"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { supabaseAdmin } from "@/lib/supabase"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"
import { calcChCostForPeriod } from "@/lib/analytics-engine/cost-engine"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate      = searchParams.get("startDate")
  const endDate        = searchParams.get("endDate")
  const dateColumn     = searchParams.get("dateColumn")     || "fulfiled_date"
  const comparisonType = searchParams.get("comparisonType") || "none"
  const includeShip        = searchParams.get("includeShip")        === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"
  const includeOpsCustomers = searchParams.get("includeOpsCustomers") === "1"

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter = getPrevDateFilter(startDate, endDate, comparisonType, source.dateCol)

  try {
    const { excludedCustomers } = includeOpsCustomers ? { excludedCustomers: [] } : await fetchQuarterlySettings()
    // excludeOpsByCode: dùng subquery (không cần JOIN dim_customer) — nhất quán với b2b/performance
    const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)} ${excludeOpsByCode(excludedCustomers)} ${excludeInactiveCustomers()}`
    const key = `b2b-kpis2:${dateColumn}:${startDate}:${endDate}:${comparisonType}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${includeOpsCustomers ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
    const [main, custRevRows] = await Promise.all([
      queryAnalytics<Record<string, string>>(
        `WITH current_period AS (
           SELECT SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.marginCol}) as margin, COUNT(DISTINCT f.order_code) as orders
           FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2B' AND ${filter} ${sfx}
         ),
         previous_period AS (
           SELECT SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.marginCol}) as margin, COUNT(DISTINCT f.order_code) as orders
           FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE UPPER(s.group_name) = 'B2B' AND ${prevFilter} ${sfx}
         )
         SELECT cur.revenue as current_revenue, prv.revenue as prev_revenue,
                cur.margin as current_margin, prv.margin as prev_margin,
                cur.orders as current_orders, prv.orders as prev_orders
         FROM current_period cur, previous_period prv`
      ),
      // Revenue theo KH×tháng — để áp Turso per-customer cost (nhất quán b2b/performance + Quarter Report,
      // KHÔNG dùng analytics_channel_costs cho B2B để tránh double-count với Turso).
      queryAnalytics<Record<string, string>>(
        `SELECT TRIM(f.customer_code) as customer_code,
                TO_CHAR(f.${source.dateCol}::DATE, 'YYYY-MM') as month,
                SUM(CASE WHEN ${filter} THEN f.${source.revenueCol} ELSE 0 END) as current_revenue,
                SUM(CASE WHEN ${prevFilter} THEN f.${source.revenueCol} ELSE 0 END) as prev_revenue
         FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2B' AND (${filter} OR ${prevFilter}) ${sfx}
         GROUP BY TRIM(f.customer_code), month`
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

      // 1. Per-customer costs (Turso b2b_customer_cost_monthly) — khớp b2b/performance + Quarter Report.
      const customerCostMap = await fetchCustomerCosts(allMonths)
      const custRevMapCur: Record<string, number> = {}
      const custRevMapPrv: Record<string, number> = {}
      custRevRows.forEach(row => {
        custRevMapCur[`${row.month}_${row.customer_code}`] = parseFloat(row.current_revenue || "0")
        custRevMapPrv[`${row.month}_${row.customer_code}`] = parseFloat(row.prev_revenue || "0")
      })
      customerCostMap.forEach((rec, key) => {
        const mo = key.slice(0, 7); const code = key.slice(8)
        if (currentMonths.includes(mo)) {
          const cRev = custRevMapCur[`${mo}_${code}`] || 0
          if (cRev !== 0) {
            const ratio = getDaysInMonth(mo) > 0 ? getDaysInRange(startDate!, endDate!, mo) / getDaysInMonth(mo) : 0
            totalOpCost += calcChCostForPeriod(rec, cRev, ratio)
          }
        }
        if (prevMonths.includes(mo)) {
          const pRev = custRevMapPrv[`${mo}_${code}`] || 0
          if (pRev !== 0) {
            const ratio = getDaysInMonth(mo) > 0 ? getDaysInRange(pStartString, pEndString, mo) / getDaysInMonth(mo) : 0
            prevTotalOpCost += calcChCostForPeriod(rec, pRev, ratio)
          }
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
    }, QUERY_TTL_MIN, noCache(req), ["b2b-cost"])

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2b/kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
