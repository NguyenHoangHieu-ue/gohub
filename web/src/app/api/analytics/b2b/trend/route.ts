import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter,
  getChannelCostsForMonths, getGroupCostsForMonths, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard,
} from "@/lib/analytics-helpers"

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn")  || "fulfiled_date"
  const granularity = searchParams.get("granularity") || "day"

  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 })

  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate, endDate, source.dateCol)

  let groupBySQL = `TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM-DD')`
  if (granularity === "week")  groupBySQL = `TO_CHAR(DATE_TRUNC('week', f.${source.dateCol}::date), 'YYYY-MM-DD')`
  else if (granularity === "month") groupBySQL = `TO_CHAR(DATE_TRUNC('month', f.${source.dateCol}::date), 'YYYY-MM')`

  try {
    const key = `b2b-trend:${dateColumn}:${startDate}:${endDate}:${granularity}`
    const payload = await cachedQuery(key, async () => {
    const [result, channelGrouped] = await Promise.all([
      queryAnalytics<Record<string, any>>(
        `SELECT ${groupBySQL} as name,
                SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol}) as margin,
                ARRAY_AGG(DISTINCT TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM')) as months
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2B' AND ${filter}
         GROUP BY 1 ORDER BY 1 ASC`
      ),
      queryAnalytics<Record<string, string>>(
        `SELECT ${groupBySQL} as group_date,
                TRIM(s.channel_name) as channel,
                UPPER(s.group_name) as group_name,
                SUM(f.${source.revenueCol}) as revenue,
                TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2B' AND ${filter}
         GROUP BY 1, 2, 3, 5`
      ),
    ])

    const allMonths = Array.from(new Set(result.flatMap(r => (r.months as string[]) || [])))
    const allCosts  = await getChannelCostsForMonths(allMonths)
    const groupCosts = await getGroupCostsForMonths(allMonths) as Array<{ group_name: string; month: string; amount: string }>

    const trend = result.map(r => {
      const groupDate = r.name as string
      const totalRevenue = parseFloat(r.revenue || "0")
      const totalMargin  = parseFloat(r.margin || "0")
      let totalOpCost = 0

      channelGrouped.filter(cr => cr.group_date === groupDate).forEach(dc => {
        const monthDays = new Date(parseInt(dc.month.slice(0, 4)), parseInt(dc.month.slice(5, 7)), 0).getDate()
        const groupRevenue = parseFloat(dc.revenue || "0")

        allCosts.filter(c => c.channel === dc.channel && c.month === dc.month).forEach(c => {
          COST_KEYS.forEach(key => {
            const cv = c[key]
            if (cv) {
              if (cv.type === "amount") {
                const monthlyVal = cv.value || 0
                if (granularity === "month") totalOpCost += monthlyVal
                else if (granularity === "day") totalOpCost += monthlyVal / monthDays
                else totalOpCost += (monthlyVal / monthDays) * 7
              } else {
                totalOpCost += (groupRevenue * (cv.value || 0)) / 100
              }
            }
          })
        })

        const groupName = dc.group_name || "Other"
        groupCosts.filter(c => c.group_name === groupName && c.month === dc.month).forEach(mgc => {
          const monthlyVal = parseFloat(mgc.amount || "0")
          if (granularity === "month") totalOpCost += monthlyVal
          else if (granularity === "day") totalOpCost += monthlyVal / monthDays
          else totalOpCost += (monthlyVal / monthDays) * 7
        })
      })

      return { name: groupDate, revenue: totalRevenue, gpm2: totalMargin - totalOpCost }
    })

    return trend
    }, QUERY_TTL_MIN)

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2b/trend]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
