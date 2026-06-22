import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, getPrevDateFilter,
  getStrategicPartnersList, getGroupCaseSQL, getTargetSummary, getBODFilters
, CACHE_HEADERS } from "@/lib/analytics-helpers"

async function fetchBODSummaryData(startDate: string, endDate: string, dateColumn = "fulfiled_date", extraFilters = "") {
  const source        = getAnalyticsSource(dateColumn)
  const filter        = getDateFilter(startDate, endDate, source.dateCol)
  const strategicList = await getStrategicPartnersList()
  const groupCaseSQL  = getGroupCaseSQL(strategicList)

  const [summaryRows, groupRows] = await Promise.all([
    queryAnalytics<Record<string, string>>(
      `SELECT SUM(f.${source.revenueCol}) as total_revenue,
              SUM(f.${source.cogsCol})    as total_cogs,
              SUM(f.${source.marginCol})  as total_margin,
              SUM(f.${source.quantityCol}) as total_units
       FROM ${source.mainTable} f WHERE ${filter} ${extraFilters}`
    ),
    queryAnalytics<Record<string, string>>(
      `SELECT ${groupCaseSQL} as "group",
              SUM(f.${source.revenueCol}) as revenue,
              SUM(f.${source.marginCol})  as margin,
              SUM(f.${source.quantityCol}) as units,
              COUNT(DISTINCT f.order_code) as orders
       FROM ${source.mainTable} f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE ${filter} ${extraFilters}
       GROUP BY "group"`
    ),
  ])

  const s = summaryRows[0] || {}
  const totalRevenue = parseFloat(s.total_revenue || "0")
  const totalMargin  = parseFloat(s.total_margin  || "0")

  return {
    total_revenue:     totalRevenue,
    total_cogs:        parseFloat(s.total_cogs   || "0"),
    total_margin:      totalMargin,
    total_units:       parseFloat(s.total_units  || "0"),
    avg_margin_percent: totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0,
    total_gpm2:        totalMargin, // no op costs for now
    avg_gpm2_percent:  totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0,
    groups:            groupRows.map(r => ({
      group:          r.group,
      revenue:        parseFloat(r.revenue || "0"),
      margin:         parseFloat(r.margin  || "0"),
      units:          parseFloat(r.units   || "0"),
      orders:         parseInt(r.orders    || "0"),
      margin_percent: parseFloat(r.revenue || "0") > 0
        ? (parseFloat(r.margin || "0") / parseFloat(r.revenue || "0")) * 100 : 0,
    })),
  }
}

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
    const current = await fetchBODSummaryData(startDate, endDate, dateColumn, extraFilters)

    // previous period
    const s    = new Date(startDate)
    const e    = new Date(endDate)
    const diff = e.getTime() - s.getTime()
    const prevEnd   = new Date(s.getTime() - 86400000)
    const prevStart = new Date(prevEnd.getTime() - diff)
    const previous  = await fetchBODSummaryData(
      prevStart.toISOString().split("T")[0],
      prevEnd.toISOString().split("T")[0],
      dateColumn,
      extraFilters
    )

    // previous year
    const lyStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate())
    const lyEnd   = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate())
    const prevYear = await fetchBODSummaryData(
      lyStart.toISOString().split("T")[0],
      lyEnd.toISOString().split("T")[0],
      dateColumn,
      extraFilters
    )

    // target revenue
    const targetData = await getTargetSummary(startDate, endDate)

    return NextResponse.json({
      ...current,
      total_target_revenue: targetData.proRataTarget,
      previous_period:      previous,
      previous_year:        prevYear,
    })
  } catch (err: any) {
    console.error("[analytics/bod-summary]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
