import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter, getPartnerTiers } from "@/lib/analytics-helpers"

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
    const tiers = await getPartnerTiers()
    const strategicPartners: string[] = (tiers["Strategic"] || []) as string[]

    if (strategicPartners.length === 0) return NextResponse.json([])

    const strategicList = strategicPartners.map(p => `'%${p.replace(/'/g, "''")}%'`).join(",")

    const rows = await queryAnalytics<Record<string, string>>(
      `WITH current_period AS (
         SELECT TRIM(s.channel_name) as name,
                CASE ${strategicPartners.map((p, i) => `WHEN s.channel_name ILIKE '%${p.replace(/'/g, "''")}%' THEN '${Object.entries(tiers).find(([, partners]) => (partners as string[]).includes(p))?.[0] || "Strategic"}'`).join(" ")} ELSE 'Strategic' END as tier,
                COUNT(DISTINCT f.order_code) as orders,
                SUM(f.${source.quantityCol}) as units,
                SUM(f.${source.revenueCol}) as revenue
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE s.channel_name ILIKE ANY(ARRAY[${strategicList}]::text[])
         AND ${filter}
         GROUP BY TRIM(s.channel_name), tier
       ),
       previous_period AS (
         SELECT TRIM(s.channel_name) as name,
                SUM(f.${source.revenueCol}) as revenue
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE s.channel_name ILIKE ANY(ARRAY[${strategicList}]::text[])
         AND ${prevFilter}
         GROUP BY TRIM(s.channel_name)
       )
       SELECT c.name, c.tier, c.orders, c.units, c.revenue,
              CASE WHEN COALESCE(p.revenue, 0) = 0 THEN 0
                   ELSE ((c.revenue - p.revenue) / p.revenue) * 100
              END as mom
       FROM current_period c
       LEFT JOIN previous_period p ON c.name = p.name
       ORDER BY c.revenue DESC`
    )

    return NextResponse.json(rows.map(r => ({
      name:    r.name,
      tier:    r.tier,
      orders:  parseInt(r.orders  || "0"),
      units:   parseInt(r.units   || "0"),
      revenue: parseFloat(r.revenue || "0"),
      mom:     parseFloat(r.mom   || "0"),
      channel_contributions: {},
    })))
  } catch (err: any) {
    console.error("[analytics/b2b/strategic-performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
