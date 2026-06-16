import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, getPrevDateFilter,
  getStrategicPartnersList, getGroupCaseSQL
} from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn") || "fulfiled_date"
  const companyCode = searchParams.get("companyCode") || undefined

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol, "30 days", companyCode)
  const prevFilter = getPrevDateFilter(startDate, endDate, "none", source.dateCol, "30 days", companyCode)

  try {
    const strategicList = await getStrategicPartnersList()
    const groupCaseSQL  = getGroupCaseSQL(strategicList)

    const rows = await queryAnalytics<Record<string, string>>(
      `WITH current_period AS (
         SELECT COALESCE(s.channel_name, 'Unknown') as "channel_name",
                ${groupCaseSQL} as business_group,
                COUNT(DISTINCT f.order_code) as totalOrder,
                SUM(f.${source.quantityCol}) as unitSold,
                SUM(f.${source.revenueCol}) as grossRevenue
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${filter}
         GROUP BY "channel_name", business_group
       ),
       previous_period AS (
         SELECT COALESCE(s.channel_name, 'Unknown') as "channel_name",
                SUM(f.${source.revenueCol}) as grossRevenue
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${prevFilter}
         GROUP BY "channel_name"
       )
       SELECT c."channel_name" as "group",
              c.business_group, c.totalOrder, c.unitSold, c.grossRevenue,
              CASE WHEN COALESCE(p.grossRevenue, 0) = 0 THEN 0
                   ELSE ((c.grossRevenue - p.grossRevenue) / p.grossRevenue) * 100
              END as mom
       FROM current_period c
       LEFT JOIN previous_period p ON c."channel_name" = p."channel_name"
       ORDER BY
         CASE WHEN c.business_group LIKE 'B2B%' THEN 1 WHEN c.business_group = 'B2C' THEN 2 ELSE 3 END,
         c.grossRevenue DESC`
    )

    return NextResponse.json(rows.map(r => ({
      group:          r.group,
      business_group: r.business_group,
      totalOrder:     parseInt(r.totalorder    || r.totalOrder    || "0"),
      unitSold:       parseInt(r.unitsold      || r.unitSold      || "0"),
      grossRevenue:   parseFloat(r.grossrevenue || r.grossRevenue || "0"),
      mom:            parseFloat(r.mom          || "0"),
    })))
  } catch (err: any) {
    console.error("[analytics/performance-channel]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
