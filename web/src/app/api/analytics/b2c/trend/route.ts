import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, shipFilter, internalOpsFilter, excludeOpsByCode, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache } from "@/lib/analytics-helpers"
import { rollupCtx, ruHeaders, ruKey, serve } from "@/lib/rollup/serve"
import { rollupFirstDay, type PerfRow } from "@/lib/rollup/b2bperf"
import { diffB2cTrend, fetchB2cTrendRollup } from "@/lib/rollup/b2c2"
import { fetchQuarterlySettings, exclHash, excludedForB2C } from "@/lib/quarterly-settings"

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
  const ctx = await rollupCtx("b2c-trend")
  const dateFormat = period === "quarter" ? `YYYY-"Q"Q` : "YYYY-MM"

  try {
    // Fix s197 (audit toàn hệ thống): route KHÔNG đọc 3 toggle dù FE (b2c-performance.tsx) gửi đủ cùng
    // queryParams với b2c/kpis — chart Trend không loại ship fee/đơn nội bộ trong khi KPI card cùng
    // trang có loại, số liệu lệch nhau.
    const { excludedCustomers } = includeOpsCustomers ? { excludedCustomers: [] } : { excludedCustomers: excludedForB2C((await fetchQuarterlySettings()).excludedCustomers) }
    const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)} ${excludeOpsByCode(excludedCustomers)}`
    const key = `b2c-trend${ruKey(ctx)}:${dateColumn}:${startDate}:${endDate}:${period}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${includeOpsCustomers ? 1 : 0}:${exclHash(excludedCustomers)}`
    const payload = await cachedQuery(key, async () => {
    const rawRows = () => queryAnalytics<Record<string, string>>(
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
    // Rollup chỉ phục vụ khi khoảng ngày nằm trong vùng đã dựng; còn lại đường thô.
    const basis = dateColumn === "created_date" ? "sal" : "ful"
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const ruEnd = endDate < yesterday ? endDate : yesterday
    const first = ctx.mode !== "off" ? await rollupFirstDay(basis).catch(() => null) : null
    const rows: Record<string, string>[] = first && startDate >= first && startDate <= ruEnd
      ? await serve<PerfRow[]>(ctx, rawRows, () => fetchB2cTrendRollup({ basis, start: startDate, end: ruEnd, period: period === "quarter" ? "quarter" : "month", includeShip, includeInternalOps, excludedCustomers }),
          diffB2cTrend, { dateColumn, startDate, endDate, period, includeShip, includeInternalOps, includeOpsCustomers })
      : await rawRows()
    return rows.map(r => ({
      name:           r.name,
      revenue:        parseFloat(r.revenue        || "0"),
      margin:         parseFloat(r.margin         || "0"),
      margin_percent: parseFloat(r.margin_percent || "0"),
    }))
    }, QUERY_TTL_MIN, noCache(req))

    return NextResponse.json(payload, { headers: ruHeaders(ctx, CACHE_HEADERS) })
  } catch (err: any) {
    console.error("[analytics/b2c/trend]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
