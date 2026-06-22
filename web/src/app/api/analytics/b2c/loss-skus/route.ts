import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getBODFilters } from "@/lib/analytics-helpers"

// Port intel /api/analytics/b2c/loss-skus: top 10 SKU B2C bị LỖ (margin < 0) trong kỳ.
// Dùng cho intel B2CPerformance (B2C-2). Advanced filters (vendors/subChannels/productTypes) qua getBODFilters.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get("startDate")
  const endDate    = searchParams.get("endDate")
  const dateColumn = searchParams.get("dateColumn") || "fulfiled_date"
  if (!startDate || !endDate) return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })

  const source         = getAnalyticsSource(dateColumn)
  const filter         = getDateFilter(startDate, endDate, source.dateCol)
  const advancedFilter = getBODFilters(searchParams)

  try {
    const rows = await queryAnalytics<Record<string, string>>(
      `WITH b2c_data AS (
         SELECT f.*
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2C' AND ${filter} ${advancedFilter}
       )
       SELECT sku, SUM(${source.revenueCol}) as revenue, SUM(${source.marginCol}) as loss
       FROM b2c_data
       WHERE ${source.marginCol} < 0
       GROUP BY sku
       ORDER BY loss ASC
       LIMIT 10`
    )
    return NextResponse.json(rows.map(r => ({
      sku:     r.sku,
      revenue: parseFloat(r.revenue || "0"),
      loss:    Math.abs(parseFloat(r.loss || "0")),
    })))
  } catch (err: any) {
    console.error("[analytics/b2c/loss-skus]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
