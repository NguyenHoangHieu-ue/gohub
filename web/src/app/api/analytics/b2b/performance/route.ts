import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter, getStrategicPartnersList , CACHE_HEADERS } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate      = searchParams.get("startDate")
  const endDate        = searchParams.get("endDate")
  const dateColumn     = searchParams.get("dateColumn") || "fulfiled_date"
  const groupBy        = searchParams.get("groupBy")    || "channel"

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter = getPrevDateFilter(startDate, endDate, "none", source.dateCol)

  let selectName = `COALESCE(TRIM(s.channel_name), 'Unknown')`
  let join       = `LEFT JOIN dim_order_source s ON f.order_source_code = s.code`
  let groupFilter = `UPPER(s.group_name) = 'B2B'`

  if (groupBy === "vendor") {
    selectName  = `COALESCE(v.vendor, 'Unknown')`
    join        = `LEFT JOIN dim_order_source s ON f.order_source_code = s.code LEFT JOIN dim_sku v ON f.sku = v.sku`
  }

  try {
    const strategicList = await getStrategicPartnersList()

    const rows = await queryAnalytics<Record<string, string>>(
      `WITH cur AS (
         SELECT ${selectName} as name,
                SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                SUM(f.${source.quantityCol}) as units,
                COUNT(DISTINCT f.order_code) as orders
         FROM ${source.mainTable} f
         ${join}
         WHERE ${groupFilter} AND ${filter}
         GROUP BY 1
       ),
       prv AS (
         SELECT ${selectName} as name,
                SUM(f.${source.revenueCol}) as revenue
         FROM ${source.mainTable} f
         ${join}
         WHERE ${groupFilter} AND ${prevFilter}
         GROUP BY 1
       )
       SELECT c.name, c.revenue, c.margin, c.units, c.orders,
              COALESCE(p.revenue, 0) as prev_revenue
       FROM cur c LEFT JOIN prv p ON c.name = p.name
       ORDER BY c.revenue DESC LIMIT 50`
    )

    return NextResponse.json(rows.map(r => {
      const rev = parseFloat(r.revenue      || "0")
      const mar = parseFloat(r.margin       || "0")
      const prv = parseFloat(r.prev_revenue || "0")
      return {
        name:           r.name,
        revenue:        rev,
        margin:         mar,
        margin_percent: rev > 0 ? (mar / rev) * 100 : 0,
        gpm2:           mar,
        gpm2_percent:   rev > 0 ? (mar / rev) * 100 : 0,
        units:          parseFloat(r.units  || "0"),
        prev_revenue:   prv,
      }
    }))
  } catch (err: any) {
    console.error("[analytics/b2b/performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
