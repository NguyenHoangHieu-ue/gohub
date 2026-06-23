import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getTargetSummary, getBODFilters } from "@/lib/analytics-helpers"
import { fetchBODGroupMarginData } from "@/lib/bod-data"

// Port intel bod-summary: summary (rev/margin/gpm2 + %) lấy từ fetchBODGroupMarginData (gồm op-cost);
// total_units/total_cogs từ raw query; total_target_revenue prorate; previous_period + previous_year.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get("startDate")
  const endDate    = searchParams.get("endDate")
  const dateColumn = searchParams.get("dateColumn") || "fulfiled_date"
  const extraFilters = getBODFilters(searchParams)

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const groupResult = await fetchBODGroupMarginData(startDate, endDate, dateColumn, extraFilters)
    const current: any = { ...groupResult.summary }

    // total_units / total_cogs từ toàn bộ bảng (raw, không group)
    const source = getAnalyticsSource(dateColumn)
    const rawRows = await queryAnalytics<Record<string, string>>(
      `SELECT SUM(f.${source.cogsCol}) as total_cogs, SUM(f.${source.quantityCol}) as total_units
       FROM ${source.mainTable} f WHERE ${getDateFilter(startDate, endDate, source.dateCol)} ${extraFilters}`
    )
    current.total_cogs  = parseFloat(rawRows[0]?.total_cogs || "0")
    current.total_units = parseFloat(rawRows[0]?.total_units || "0")

    // 3HK Contribution Revenue % = doanh thu SP 3HKDATAPOOL / total revenue (key metric team Business, new_info 23/06)
    const fetch3hkRev = async (sd: string, ed: string) => {
      const rows = await queryAnalytics<{ r: string }>(
        `SELECT SUM(CASE WHEN TRIM(f.sku) IN (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) ILIKE '3HKDATAPOOL') THEN f.${source.revenueCol} ELSE 0 END) as r
         FROM ${source.mainTable} f WHERE ${getDateFilter(sd, ed, source.dateCol)} ${extraFilters}`
      )
      return parseFloat(rows[0]?.r || "0")
    }
    current.total_3hk_revenue = await fetch3hkRev(startDate, endDate)
    current.total_3hk_contribution = current.total_revenue > 0 ? (current.total_3hk_revenue / current.total_revenue) * 100 : 0

    // target prorate
    const targetData = await getTargetSummary(startDate, endDate)
    current.total_target_revenue = targetData.proRataTarget

    // previous period + previous year (summary only)
    const s = new Date(startDate); const e = new Date(endDate)
    const diff = e.getTime() - s.getTime()
    const prevEnd = new Date(s.getTime() - 86400000)
    const prevStart = new Date(prevEnd.getTime() - diff)
    const lyStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate())
    const lyEnd   = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate())

    const [prev, prevYear, prev3hk, ly3hk] = await Promise.all([
      fetchBODGroupMarginData(prevStart.toISOString().split("T")[0], prevEnd.toISOString().split("T")[0], dateColumn, extraFilters),
      fetchBODGroupMarginData(lyStart.toISOString().split("T")[0], lyEnd.toISOString().split("T")[0], dateColumn, extraFilters),
      fetch3hkRev(prevStart.toISOString().split("T")[0], prevEnd.toISOString().split("T")[0]),
      fetch3hkRev(lyStart.toISOString().split("T")[0], lyEnd.toISOString().split("T")[0]),
    ])
    ;(prev.summary as any).total_3hk_contribution = prev.summary.total_revenue > 0 ? (prev3hk / prev.summary.total_revenue) * 100 : 0
    ;(prevYear.summary as any).total_3hk_contribution = prevYear.summary.total_revenue > 0 ? (ly3hk / prevYear.summary.total_revenue) * 100 : 0

    return NextResponse.json({
      ...current,
      previous_period: prev.summary,
      previous_year: prevYear.summary,
    })
  } catch (err: any) {
    console.error("[analytics/bod-summary]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
