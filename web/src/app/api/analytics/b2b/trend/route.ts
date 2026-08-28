import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter,
  getGroupCostsForMonths, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache,
  shipFilter, internalOpsFilter, excludeOpsByCode, excludeInactiveCustomers,
} from "@/lib/analytics-helpers"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"
import { calcChCostForPeriod } from "@/lib/analytics-engine/cost-engine"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn")  || "fulfiled_date"
  const granularity = searchParams.get("granularity") || "day"
  const includeShip        = searchParams.get("includeShip")        === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"
  const includeOpsCustomers = searchParams.get("includeOpsCustomers") === "1"

  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })

  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate, endDate, source.dateCol)

  let groupBySQL = `TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM-DD')`
  if (granularity === "week")  groupBySQL = `TO_CHAR(DATE_TRUNC('week', f.${source.dateCol}::date), 'YYYY-MM-DD')`
  else if (granularity === "month") groupBySQL = `TO_CHAR(DATE_TRUNC('month', f.${source.dateCol}::date), 'YYYY-MM')`

  try {
    const { excludedCustomers } = includeOpsCustomers ? { excludedCustomers: [] } : await fetchQuarterlySettings()
    // Khớp filter chuẩn b2b/kpis + b2b/performance + Quarter Report (trước đây trend KHÔNG lọc gì ngoài
    // group_name/date → chart lệch khỏi KPI card/Quarter Report khi có phí ship/đơn nội bộ/KH ops/KH INACTIVE).
    const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)} ${excludeOpsByCode(excludedCustomers)} ${excludeInactiveCustomers()}`
    const exclHash = excludedCustomers.length ? excludedCustomers.slice().sort().join(",") : ""
    const key = `b2b-trend2:${dateColumn}:${startDate}:${endDate}:${granularity}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${includeOpsCustomers ? 1 : 0}:${exclHash}`
    const payload = await cachedQuery(key, async () => {
    const [result, groupGrouped, custGrouped] = await Promise.all([
      queryAnalytics<Record<string, any>>(
        `SELECT ${groupBySQL} as name,
                SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol}) as margin,
                ARRAY_AGG(DISTINCT TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM')) as months
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2B' AND ${filter} ${sfx}
         GROUP BY 1 ORDER BY 1 ASC`
      ),
      queryAnalytics<Record<string, string>>(
        `SELECT ${groupBySQL} as group_date,
                UPPER(s.group_name) as group_name,
                TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2B' AND ${filter} ${sfx}
         GROUP BY 1, 2, 3`
      ),
      // B2B per-customer revenue per bucket — để áp Turso cost thay analytics_channel_costs (tránh double-count,
      // khớp Quarter Report/b2b-kpis/b2b-performance).
      queryAnalytics<Record<string, string>>(
        `SELECT ${groupBySQL} as group_date,
                TRIM(f.customer_code) as customer_code,
                SUM(f.${source.revenueCol}) as revenue,
                TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2B' AND ${filter} ${sfx}
         GROUP BY 1, 2, 4`
      ),
    ])

    const allMonths = Array.from(new Set(result.flatMap(r => (r.months as string[]) || [])))
    const groupCosts = await getGroupCostsForMonths(allMonths) as Array<{ group_name: string; month: string; amount: string }>
    const customerCostMap = await fetchCustomerCosts(allMonths)

    const trend = result.map(r => {
      const groupDate = r.name as string
      const totalRevenue = parseFloat(r.revenue || "0")
      const totalMargin  = parseFloat(r.margin || "0")
      let totalOpCost = 0

      groupGrouped.filter(cr => cr.group_date === groupDate).forEach(dc => {
        const monthDays = new Date(parseInt(dc.month.slice(0, 4)), parseInt(dc.month.slice(5, 7)), 0).getDate()
        const groupName = dc.group_name || "Other"
        groupCosts.filter(c => c.group_name === groupName && c.month === dc.month).forEach(mgc => {
          const monthlyVal = parseFloat(mgc.amount || "0")
          if (granularity === "month") totalOpCost += monthlyVal
          else if (granularity === "day") totalOpCost += monthlyVal / monthDays
          else totalOpCost += (monthlyVal / monthDays) * 7
        })
      })

      // B2B per-customer cost (Turso) — thay analytics_channel_costs, dùng dayRatio khớp granularity.
      custGrouped.filter(cr => cr.group_date === groupDate).forEach(dc => {
        const monthDays = new Date(parseInt(dc.month.slice(0, 4)), parseInt(dc.month.slice(5, 7)), 0).getDate()
        const custRev = parseFloat(dc.revenue || "0")
        if (custRev === 0) return
        const rec = customerCostMap.get(`${dc.month}_${dc.customer_code}`)
        if (!rec) return
        const dayRatio = granularity === "month" ? 1 : granularity === "day" ? 1 / monthDays : 7 / monthDays
        totalOpCost += calcChCostForPeriod(rec, custRev, dayRatio)
      })

      return { name: groupDate, revenue: totalRevenue, gpm2: totalMargin - totalOpCost }
    })

    return trend
    }, QUERY_TTL_MIN, noCache(req))

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2b/trend]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
