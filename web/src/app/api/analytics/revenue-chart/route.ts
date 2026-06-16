import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getStrategicPartnersList } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn") || "fulfiled_date"
  const companyCode = searchParams.get("companyCode") || undefined

  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate, endDate, source.dateCol, "30 days", companyCode)

  try {
    const strategicList = await getStrategicPartnersList()
    const rows = await queryAnalytics<Record<string, string>>(
      `WITH filtered_f AS (
         SELECT ${source.dateCol} as date, order_source_code, ${source.revenueCol} as revenue
         FROM ${source.mainTable} f WHERE ${filter}
       )
       SELECT
         TO_CHAR(f.date::date, 'DD/MM') as name,
         SUM(CASE WHEN s.group_name = 'B2B' AND s.channel_name ILIKE ANY(ARRAY[${strategicList}]::text[]) THEN f.revenue ELSE 0 END) as b2b_strategic,
         SUM(CASE WHEN s.group_name = 'B2B' AND s.channel_name NOT ILIKE ANY(ARRAY[${strategicList}]::text[]) THEN f.revenue ELSE 0 END) as b2b_non_strategic,
         SUM(CASE WHEN s.group_name = 'B2C' THEN f.revenue ELSE 0 END) as b2c,
         SUM(CASE WHEN s.group_name NOT IN ('B2B','B2C') OR s.group_name IS NULL THEN f.revenue ELSE 0 END) as other
       FROM filtered_f f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       GROUP BY f.date::date
       ORDER BY f.date::date`
    )
    return NextResponse.json(rows.map(r => ({
      name:             r.name,
      b2b_strategic:    parseFloat(r.b2b_strategic    || "0"),
      b2b_non_strategic:parseFloat(r.b2b_non_strategic|| "0"),
      b2c:              parseFloat(r.b2c              || "0"),
      other:            parseFloat(r.other            || "0"),
    })))
  } catch (err: any) {
    console.error("[analytics/revenue-chart]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
