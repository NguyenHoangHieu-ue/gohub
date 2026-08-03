import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, cachedQuery, CACHE_HEADERS, analyticsGuard, getCustomerStrategicSql } from "@/lib/analytics-helpers"

// Phân loại B2B-Strategic theo price_list_name (KHÁCH) — dùng CHUNG cấu hình quarterly-settings với Quarter Report,
// bảng "Phân khúc" (tier-performance), BOD & All-Time. Trước đây line chart dùng partner_tiers (KÊNH) → rỗng → Strategic=0.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn") || "fulfiled_date"
  const companyCode = searchParams.get("companyCode") || "ALL"

  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate, endDate, source.dateCol, "30 days", companyCode)
  const { isStrategicSql, excludeSql, hash } = await getCustomerStrategicSql()
  // hash = tier keywords + excluded (quarterly-settings) → cache tự tươi khi Hiếu đổi cấu hình.
  const cacheKey = `revenue-chart2:${startDate}:${endDate}:${dateColumn}:${companyCode}:${hash}`
  const b2bReal = `UPPER(COALESCE(s.group_name,'')) = 'B2B' AND COALESCE(c.name, TRIM(f.customer_code)) NOT IN (${excludeSql})`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const rows = await queryAnalytics<Record<string, string>>(
        `WITH filtered_f AS (
           SELECT ${source.dateCol} as date, order_source_code, customer_code, ${source.revenueCol} as revenue
           FROM ${source.mainTable} f WHERE ${filter}
         )
         SELECT
           TO_CHAR(f.date::date, 'DD/MM') as name,
           SUM(CASE WHEN ${b2bReal} AND ${isStrategicSql} THEN f.revenue ELSE 0 END) as b2b_strategic,
           SUM(CASE WHEN ${b2bReal} AND NOT ${isStrategicSql} THEN f.revenue ELSE 0 END) as b2b_non_strategic,
           SUM(CASE WHEN s.group_name = 'B2C' THEN f.revenue ELSE 0 END) as b2c,
           SUM(CASE WHEN s.group_name NOT IN ('B2B','B2C') OR s.group_name IS NULL THEN f.revenue ELSE 0 END) as other
         FROM filtered_f f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
         GROUP BY f.date::date ORDER BY f.date::date`
      )
      return rows.map(r => ({
        name:              r.name,
        b2b_strategic:     parseFloat(r.b2b_strategic     || "0"),
        b2b_non_strategic: parseFloat(r.b2b_non_strategic || "0"),
        b2c:               parseFloat(r.b2c               || "0"),
        other:             parseFloat(r.other              || "0"),
      }))
    })

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/revenue-chart]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
