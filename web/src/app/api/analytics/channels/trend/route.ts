import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter , CACHE_HEADERS } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn")   || "fulfiled_date"
  const channelName = searchParams.get("channel")      || ""
  const channelGroup = searchParams.get("channelGroup") || ""

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const chFilter   = channelName
    ? `AND TRIM(s.channel_name) = '${channelName.replace(/'/g, "''")}'`
    : channelGroup && channelGroup !== "All"
      ? `AND UPPER(s.group_name) = '${channelGroup.toUpperCase()}'`
      : ""

  try {
    const rows = await queryAnalytics<Record<string, string>>(
      `SELECT TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM-DD') as name,
              SUM(f.${source.revenueCol}) as revenue,
              SUM(f.${source.marginCol})  as margin
       FROM ${source.mainTable} f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE ${filter} ${chFilter}
       GROUP BY 1 ORDER BY 1`
    )
    return NextResponse.json(rows.map(r => ({
      name:    r.name,
      revenue: parseFloat(r.revenue || "0"),
      margin:  parseFloat(r.margin  || "0"),
    })))
  } catch (err: any) {
    console.error("[analytics/channels/trend]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
