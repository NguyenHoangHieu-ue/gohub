import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { rollupCtx, ruHeaders, ruKey, serve } from "@/lib/rollup/serve"
import { rollupFirstDay, type PerfRow } from "@/lib/rollup/b2bperf"
import { prevRange } from "@/lib/rollup/b2bkpis"
import * as ch from "@/lib/rollup/channels"
import { fetchQuarterlySettings, makeExcludeSql, exclHash } from "@/lib/quarterly-settings"
import { getAnalyticsSource, getDateFilter, shipFilter, internalOpsFilter, excludeInactiveCustomers, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

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

  const { excludedCustomers } = await fetchQuarterlySettings()
  const exSql = makeExcludeSql(excludedCustomers)
  try {
    const ctx = await rollupCtx("channels-trend")
    const key = `ch-trend3${ruKey(ctx)}:${dateColumn}:${startDate}:${endDate}:${channelName}:${channelGroup}:${exclHash(excludedCustomers)}`
    const payload = await cachedQuery(key, async () => {
    const rawRows = () => queryAnalytics<PerfRow>(
      `SELECT TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM-DD') as name,
              SUM(f.${source.revenueCol}) as revenue,
              SUM(f.${source.marginCol})  as margin
       FROM ${source.mainTable} f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE ${filter} ${chFilter} ${shipFilter(false)} ${internalOpsFilter(false)} ${excludeInactiveCustomers()} ${exSql}
       GROUP BY 1 ORDER BY 1`
    )
    // Rollup chỉ phục vụ khi khoảng ngày nằm trong vùng đã dựng; còn lại đường thô.
    const basis = dateColumn === "created_date" ? "sal" : "ful"
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const ruEnd = endDate < yesterday ? endDate : yesterday
    const first = ctx.mode !== "off" ? await rollupFirstDay(basis).catch(() => null) : null
    const rows: PerfRow[] = first && startDate >= first && startDate <= ruEnd
      ? await serve<PerfRow[]>(ctx, rawRows, () => ch.fetchChTrendRollup({ basis, start: startDate, end: ruEnd, excludedCustomers, channelName, channelGroup }), ch.diffChTrend, { startDate, endDate, dateColumn, channelName, channelGroup })
      : await rawRows()
    return rows.map(r => ({
      name:    r.name,
      revenue: parseFloat(r.revenue || "0"),
      margin:  parseFloat(r.margin  || "0"),
    }))
    }, QUERY_TTL_MIN)

    return NextResponse.json(payload, { headers: ruHeaders(ctx, CACHE_HEADERS) })
  } catch (err: any) {
    console.error("[analytics/channels/trend]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
