import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getStrategicPartnersList, getGroupCaseSQL, getBODFilters , CACHE_HEADERS } from "@/lib/analytics-helpers"

async function fetchGroupMargin(startDate: string, endDate: string, dateColumn = "fulfiled_date", extraFilters = "") {
  const source        = getAnalyticsSource(dateColumn)
  const filter        = getDateFilter(startDate, endDate, source.dateCol)
  const strategicList = await getStrategicPartnersList()
  const groupCaseSQL  = getGroupCaseSQL(strategicList)

  const rows = await queryAnalytics<Record<string, string>>(
    `SELECT ${groupCaseSQL} as "group",
            SUM(f.${source.revenueCol}) as revenue,
            SUM(f.${source.cogsCol})    as cogs,
            SUM(f.${source.marginCol})  as margin,
            SUM(f.${source.quantityCol}) as units,
            COUNT(DISTINCT f.order_code) as orders
     FROM ${source.mainTable} f
     LEFT JOIN dim_order_source s ON f.order_source_code = s.code
     WHERE ${filter} ${extraFilters}
     GROUP BY "group"
     ORDER BY revenue DESC`
  )

  return rows.map(r => {
    const rev = parseFloat(r.revenue || "0")
    const mar = parseFloat(r.margin  || "0")
    return {
      group:          r.group,
      revenue:        rev,
      cogs:           parseFloat(r.cogs   || "0"),
      margin:         mar,
      units:          parseFloat(r.units  || "0"),
      orders:         parseInt(r.orders   || "0"),
      margin_percent: rev > 0 ? (mar / rev) * 100 : 0,
      gpm2:           mar,
      gpm2_percent:   rev > 0 ? (mar / rev) * 100 : 0,
    }
  })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate      = searchParams.get("startDate")
  const endDate        = searchParams.get("endDate")
  const dateColumn     = searchParams.get("dateColumn")     || "fulfiled_date"
  const comparisonType = searchParams.get("comparisonType") || "none"
  const extraFilters   = getBODFilters(searchParams)

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 })
  }

  try {
    const current = await fetchGroupMargin(startDate, endDate, dateColumn, extraFilters)

    if (comparisonType !== "none") {
      const s = new Date(startDate)
      const e = new Date(endDate)
      let prevStart: Date, prevEnd: Date

      if (comparisonType === "previous_period") {
        const diff = e.getTime() - s.getTime()
        prevEnd   = new Date(s.getTime() - 86400000)
        prevStart = new Date(prevEnd.getTime() - diff)
      } else {
        prevStart = new Date(s.getFullYear() - 1, s.getMonth(), s.getDate())
        prevEnd   = new Date(e.getFullYear() - 1, e.getMonth(), e.getDate())
      }

      const previous = await fetchGroupMargin(
        prevStart.toISOString().split("T")[0],
        prevEnd.toISOString().split("T")[0],
        dateColumn,
        extraFilters
      )

      return NextResponse.json(current.map(curr => {
        const prev = previous.find(p => p.group === curr.group)
        return { ...curr, prev_revenue: prev?.revenue || 0, prev_margin: prev?.margin || 0 }
      }))
    }

    return NextResponse.json(current)
  } catch (err: any) {
    console.error("[analytics/bod-group-margin]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
