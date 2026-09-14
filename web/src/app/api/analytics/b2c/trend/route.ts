import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, shipFilter, internalOpsFilter, excludeOpsByCode, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache } from "@/lib/analytics-helpers"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get("startDate")
  const endDate    = searchParams.get("endDate")
  const dateColumn = searchParams.get("dateColumn") || "fulfiled_date"
  const period     = searchParams.get("period")     || "month"
  const includeShip         = searchParams.get("includeShip")         === "1"
  const includeInternalOps  = searchParams.get("includeInternalOps")  === "1"
  const includeOpsCustomers = searchParams.get("includeOpsCustomers") === "1"

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const dateFormat = period === "quarter" ? `YYYY-"Q"Q` : "YYYY-MM"

  try {
    // Fix s197 (audit toàn hệ thống): route KHÔNG đọc 3 toggle dù FE (b2c-performance.tsx) gửi đủ cùng
    // queryParams với b2c/kpis — chart Trend không loại ship fee/đơn nội bộ trong khi KPI card cùng
    // trang có loại, số liệu lệch nhau.
    const { excludedCustomers } = includeOpsCustomers ? { excludedCustomers: [] } : await fetchQuarterlySettings()
    const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)} ${excludeOpsByCode(excludedCustomers)}`
    const key = `b2c-trend:${dateColumn}:${startDate}:${endDate}:${period}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${includeOpsCustomers ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
    const rows = await queryAnalytics<Record<string, string>>(
      `SELECT TO_CHAR(f.${source.dateCol}::date, '${dateFormat}') as name,
              SUM(f.${source.revenueCol}) as revenue,
              SUM(f.${source.marginCol})  as margin,
              CASE WHEN SUM(f.${source.revenueCol}) > 0
                   THEN (SUM(f.${source.marginCol}) / SUM(f.${source.revenueCol})) * 100
                   ELSE 0 END as margin_percent
       FROM ${source.mainTable} f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE UPPER(s.group_name) = 'B2C' AND ${filter} ${sfx}
       GROUP BY 1 ORDER BY 1`
    )
    return rows.map(r => ({
      name:           r.name,
      revenue:        parseFloat(r.revenue        || "0"),
      margin:         parseFloat(r.margin         || "0"),
      margin_percent: parseFloat(r.margin_percent || "0"),
    }))
    }, QUERY_TTL_MIN, noCache(req))

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2c/trend]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
