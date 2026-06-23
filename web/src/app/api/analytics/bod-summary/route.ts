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

    const [prev, prevYear] = await Promise.all([
      fetchBODGroupMarginData(prevStart.toISOString().split("T")[0], prevEnd.toISOString().split("T")[0], dateColumn, extraFilters),
      fetchBODGroupMarginData(lyStart.toISOString().split("T")[0], lyEnd.toISOString().split("T")[0], dateColumn, extraFilters),
    ])

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
