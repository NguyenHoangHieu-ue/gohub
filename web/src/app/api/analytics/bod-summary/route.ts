import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getTargetSummary, getBODFilters, cachedQuery, CACHE_HEADERS, QUERY_TTL_MIN, analyticsGuard, noCache, getStrategicSettingsHash } from "@/lib/analytics-helpers"
import { fetchBODGroupMarginMulti } from "@/lib/bod-data"
import { getProjectionFactor } from "@/lib/analytics-engine/projection"

// Port intel bod-summary: summary (rev/margin/gpm2 + %) lấy từ fetchBODGroupMarginData (gồm op-cost);
// total_units/total_cogs từ raw query; total_target_revenue prorate; previous_period + previous_year.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get("startDate")
  const endDate    = searchParams.get("endDate")
  const dateColumn = searchParams.get("dateColumn") || "fulfiled_date"
  const extraFilters = getBODFilters(searchParams)
  const includeShip        = searchParams.get("includeShip")        === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const source = getAnalyticsSource(dateColumn)
    // previous period + previous year (summary only)
    const s = new Date(startDate); const e = new Date(endDate)
    const diff = e.getTime() - s.getTime()
    const prevEnd = new Date(s.getTime() - 86400000)
    const prevStart = new Date(prevEnd.getTime() - diff)
    const lyStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate())
    const lyEnd   = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate())
    const iso = (d: Date) => d.toISOString().split("T")[0]
    const periods = [
      { startDate, endDate },
      { startDate: iso(prevStart), endDate: iso(prevEnd) },
      { startDate: iso(lyStart), endDate: iso(lyEnd) },
    ]

    // s203: 3 kỳ × (2 query nhóm-biên + 1 query 3HK) + 1 query cogs/units = 10 lần quét fact → gộp còn 3 lần
    // (2 cho nhóm-biên đa kỳ, 1 cho cogs/units/3HK dùng FILTER theo kỳ). gohub_dw chạy gần như tuần tự nên đây mới là chỗ ăn thời gian.
    const conds = periods.map(p => getDateFilter(p.startDate, p.endDate, source.dateCol))
    const hk3In = `TRIM(f.sku) IN (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL')`
    const fetchAggregates = async () => {
      const cols = [
        `SUM(f.${source.cogsCol}) FILTER (WHERE (${conds[0]})) as total_cogs`,
        `SUM(f.${source.quantityCol}) FILTER (WHERE (${conds[0]})) as total_units`,
        ...conds.map((c, i) => `SUM(CASE WHEN ${hk3In} THEN f.${source.revenueCol} ELSE 0 END) FILTER (WHERE (${c})) as hk3_${i}`),
      ].join(", ")
      const rows = await queryAnalytics<Record<string, string>>(
        `SELECT ${cols} FROM ${source.mainTable} f WHERE (${conds.map(c => `(${c})`).join(" OR ")}) ${extraFilters}`
      )
      const r = rows[0] ?? {}
      return {
        total_cogs: parseFloat(r.total_cogs || "0"), total_units: parseFloat(r.total_units || "0"),
        hk3: [0, 1, 2].map(i => parseFloat(r[`hk3_${i}`] || "0")),
      }
    }

    // Cache 12h (data gohub_dw đổi 1 lần/ngày). Trước: ~20 query, nhiều cái await TUẦN TỰ → 25-50s.
    // Nay gom HẾT query độc lập vào 1 Promise.all (giảm critical path) + cache toàn bộ payload.
    const stratHash = await getStrategicSettingsHash()
    const key = `bod-summary2:${dateColumn}:${startDate}:${endDate}:${extraFilters}:${stratHash}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
      const [[groupResult, prev, prevYear], agg, targetData] = await Promise.all([
        fetchBODGroupMarginMulti(periods, dateColumn, extraFilters, includeShip, includeInternalOps),
        fetchAggregates(),
        getTargetSummary(startDate, endDate),
      ])
      const [cur3hk, prev3hk, ly3hk] = agg.hk3

      const current: any = { ...groupResult.summary }
      current.total_cogs  = agg.total_cogs
      current.total_units = agg.total_units
      current.total_3hk_revenue = cur3hk
      current.total_3hk_contribution = current.total_revenue > 0 ? (cur3hk / current.total_revenue) * 100 : 0
      current.total_target_revenue = targetData.proRataTarget
      ;(prev.summary as any).total_3hk_contribution = prev.summary.total_revenue > 0 ? (prev3hk / prev.summary.total_revenue) * 100 : 0
      ;(prevYear.summary as any).total_3hk_contribution = prevYear.summary.total_revenue > 0 ? (ly3hk / prevYear.summary.total_revenue) * 100 : 0

      return {
        ...current,
        projection_factor: getProjectionFactor(startDate, endDate),
        previous_period: prev.summary,
        previous_year: prevYear.summary,
      }
    }, QUERY_TTL_MIN, noCache(req), ["b2b-cost"])

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/bod-summary]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
