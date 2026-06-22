import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getStrategicPartnersList, getGroupCaseSQL, getBODFilters , CACHE_HEADERS } from "@/lib/analytics-helpers"

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

  const source        = getAnalyticsSource(dateColumn)
  const filter        = getDateFilter(startDate, endDate, source.dateCol)
  const strategicList = await getStrategicPartnersList()
  const groupCaseSQL  = getGroupCaseSQL(strategicList)

  try {
    const rows = await queryAnalytics<Record<string, string>>(
      `SELECT ${groupCaseSQL} as "group",
              TRIM(s.channel_name) as channel,
              SUM(f.${source.revenueCol}) as revenue,
              SUM(f.${source.cogsCol})    as cogs,
              SUM(f.${source.marginCol})  as margin,
              SUM(f.${source.quantityCol}) as units,
              COUNT(DISTINCT f.order_code) as orders
       FROM ${source.mainTable} f
       LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE ${filter} ${extraFilters}
       GROUP BY "group", channel
       ORDER BY "group", revenue DESC`
    )

    return NextResponse.json(rows.map(r => {
      const rev = parseFloat(r.revenue || "0")
      const mar = parseFloat(r.margin  || "0")
      return {
        group:          r.group,
        channel:        r.channel,
        revenue:        rev,
        cogs:           parseFloat(r.cogs  || "0"),
        margin:         mar,
        units:          parseFloat(r.units || "0"),
        orders:         parseInt(r.orders  || "0"),
        margin_percent: rev > 0 ? (mar / rev) * 100 : 0,
        gpm2:           mar,
        gpm2_percent:   rev > 0 ? (mar / rev) * 100 : 0,
      }
    }))
  } catch (err: any) {
    console.error("[analytics/bod-channel-performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
