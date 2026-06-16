import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn")  || "fulfiled_date"
  const channelName = searchParams.get("channel")     || ""
  const channelGroup = searchParams.get("channelGroup") || ""

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter = getPrevDateFilter(startDate, endDate, "none", source.dateCol)

  const chFilter = channelName
    ? `AND TRIM(s.channel_name) = '${channelName.replace(/'/g, "''")}'`
    : channelGroup && channelGroup !== "All"
      ? `AND UPPER(s.group_name) = '${channelGroup.toUpperCase().replace(/'/g, "''")}'`
      : ""

  try {
    const [cur, prv] = await Promise.all([
      queryAnalytics<Record<string, string>>(
        `SELECT SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                COUNT(DISTINCT f.order_code) as orders,
                SUM(f.${source.quantityCol}) as units
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${filter} ${chFilter}`
      ),
      queryAnalytics<Record<string, string>>(
        `SELECT SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                COUNT(DISTINCT f.order_code) as orders
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${prevFilter} ${chFilter}`
      ),
    ])

    const c   = cur[0] || {}
    const p   = prv[0] || {}
    const cRev = parseFloat(c.revenue || "0")
    const pRev = parseFloat(p.revenue || "0")
    const cMar = parseFloat(c.margin  || "0")
    const pMar = parseFloat(p.margin  || "0")
    const cOrd = parseInt(c.orders    || "0")
    const pOrd = parseInt(p.orders    || "0")
    const cUni = parseInt(c.units     || "0")
    const pct  = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100

    return NextResponse.json({
      revenue:        cRev,
      margin:         cMar,
      margin_percent: cRev > 0 ? (cMar / cRev) * 100 : 0,
      orders:         cOrd,
      units:          cUni,
      prev_revenue:   pRev,
      prev_margin:    pMar,
      prev_orders:    pOrd,
      revenue_change: pct(cRev, pRev),
      margin_change:  pct(cMar, pMar),
      orders_change:  pct(cOrd, pOrd),
    })
  } catch (err: any) {
    console.error("[analytics/channels/kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
