import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getTargetSummary, getBODFilters, cachedQuery, CACHE_HEADERS, QUERY_TTL_MIN, analyticsGuard } from "@/lib/analytics-helpers"
import { fetchBODGroupMarginData } from "@/lib/bod-data"

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

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const source = getAnalyticsSource(dateColumn)
    const fetch3hkRev = async (sd: string, ed: string) => {
      const rows = await queryAnalytics<{ r: string }>(
        `SELECT SUM(CASE WHEN TRIM(f.sku) IN (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) ILIKE '3HKDATAPOOL') THEN f.${source.revenueCol} ELSE 0 END) as r
         FROM ${source.mainTable} f WHERE ${getDateFilter(sd, ed, source.dateCol)} ${extraFilters}`
      )
      return parseFloat(rows[0]?.r || "0")
    }

    // previous period + previous year (summary only)
    const s = new Date(startDate); const e = new Date(endDate)
    const diff = e.getTime() - s.getTime()
    const prevEnd = new Date(s.getTime() - 86400000)
    const prevStart = new Date(prevEnd.getTime() - diff)
    const lyStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate())
    const lyEnd   = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate())
    const iso = (d: Date) => d.toISOString().split("T")[0]

    // Cache 12h (data gohub_dw đổi 1 lần/ngày). Trước: ~20 query, nhiều cái await TUẦN TỰ → 25-50s.
    // Nay gom HẾT query độc lập vào 1 Promise.all (giảm critical path) + cache toàn bộ payload.
    const key = `bod-summary:${dateColumn}:${startDate}:${endDate}:${extraFilters}`
    const payload = await cachedQuery(key, async () => {
      const [groupResult, rawRows, cur3hk, targetData, prev, prevYear, prev3hk, ly3hk] = await Promise.all([
        fetchBODGroupMarginData(startDate, endDate, dateColumn, extraFilters),
        queryAnalytics<Record<string, string>>(
          `SELECT SUM(f.${source.cogsCol}) as total_cogs, SUM(f.${source.quantityCol}) as total_units
           FROM ${source.mainTable} f WHERE ${getDateFilter(startDate, endDate, source.dateCol)} ${extraFilters}`
        ),
        fetch3hkRev(startDate, endDate),
        getTargetSummary(startDate, endDate),
        fetchBODGroupMarginData(iso(prevStart), iso(prevEnd), dateColumn, extraFilters),
        fetchBODGroupMarginData(iso(lyStart), iso(lyEnd), dateColumn, extraFilters),
        fetch3hkRev(iso(prevStart), iso(prevEnd)),
        fetch3hkRev(iso(lyStart), iso(lyEnd)),
      ])

      const current: any = { ...groupResult.summary }
      current.total_cogs  = parseFloat(rawRows[0]?.total_cogs || "0")
      current.total_units = parseFloat(rawRows[0]?.total_units || "0")
      current.total_3hk_revenue = cur3hk
      current.total_3hk_contribution = current.total_revenue > 0 ? (cur3hk / current.total_revenue) * 100 : 0
      current.total_target_revenue = targetData.proRataTarget
      ;(prev.summary as any).total_3hk_contribution = prev.summary.total_revenue > 0 ? (prev3hk / prev.summary.total_revenue) * 100 : 0
      ;(prevYear.summary as any).total_3hk_contribution = prevYear.summary.total_revenue > 0 ? (ly3hk / prevYear.summary.total_revenue) * 100 : 0

      return { ...current, previous_period: prev.summary, previous_year: prevYear.summary }
    }, QUERY_TTL_MIN)

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/bod-summary]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
