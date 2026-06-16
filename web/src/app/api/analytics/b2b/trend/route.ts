import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn")  || "fulfiled_date"
  const granularity = searchParams.get("granularity") || "day"

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const dateFormat = granularity === "month" ? "YYYY-MM"
                   : granularity === "week"  ? "IYYY-IW"
                   : "YYYY-MM-DD"

  try {
    const rows = await queryAnalytics<Record<string, string>>(
      `SELECT TO_CHAR(${source.dateCol}::date, '${dateFormat}') as name,
              SUM(f.${source.revenueCol}) as revenue,
              SUM(f.${source.marginCol})  as margin,
              CASE WHEN SUM(f.${source.revenueCol}) > 0
                   THEN (SUM(f.${source.marginCol}) / SUM(f.${source.revenueCol})) * 100
                   ELSE 0 END as margin_percent
       FROM ${source.mainTable} f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2B' AND ${filter}
       GROUP BY 1 ORDER BY 1 LIMIT 60`
    )
    return NextResponse.json(rows.map(r => ({
      name:           r.name,
      revenue:        parseFloat(r.revenue        || "0"),
      margin:         parseFloat(r.margin         || "0"),
      margin_percent: parseFloat(r.margin_percent || "0"),
    })))
  } catch (err: any) {
    console.error("[analytics/b2b/trend]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
