import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { cachedQuery, CACHE_HEADERS, getStrategicPartnersList, safeDate } from "@/lib/analytics-helpers"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const p = req.nextUrl.searchParams
  const startDate    = safeDate(p.get("startDate")) || "2025-01-01"
  const endDate      = safeDate(p.get("endDate"))   || new Date().toISOString().split("T")[0]
  const channelGroup = p.get("channelGroup") || ""
  const customerTier = p.get("customerTier") || ""
  const channel      = p.get("channel")      || ""

  const cacheKey = `all-time:${startDate}:${endDate}:${channelGroup}:${customerTier}:${channel}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      const strategicList = await getStrategicPartnersList()

      let whereClause = `WHERE f.fulfiled_date >= '${startDate}' AND f.fulfiled_date <= '${endDate}'`

      if (channelGroup) {
        const grp = channelGroup.toUpperCase().replace(/'/g, "''")
        whereClause += ` AND UPPER(COALESCE(s.group_name, 'Other')) = '${grp}'`
        if (grp === "B2B" && customerTier) {
          const tier = customerTier.toLowerCase()
          if (tier === "strategic") {
            whereClause += ` AND s.channel_name ILIKE ANY(ARRAY[${strategicList}]::text[])`
          } else if (tier.includes("non")) {
            whereClause += ` AND NOT (s.channel_name ILIKE ANY(ARRAY[${strategicList}]::text[]))`
          }
        }
      }
      if (channel) {
        whereClause += ` AND s.channel_name = '${channel.replace(/'/g, "''")}'`
      }

      const rows = await queryAnalytics<{
        period: string; channel_name: string; group_name: string
        derived_group: string; revenue: string; margin: string
      }>(
        `SELECT
           TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') as period,
           TRIM(COALESCE(s.channel_name, 'Unknown')) as channel_name,
           UPPER(COALESCE(s.group_name, 'Other')) as group_name,
           CASE
             WHEN UPPER(s.group_name) = 'B2B' AND s.channel_name ILIKE ANY(ARRAY[${strategicList}]::text[]) THEN 'B2B-Strategic'
             WHEN UPPER(s.group_name) = 'B2B' THEN 'B2B-Non-Strategic'
             WHEN UPPER(s.group_name) = 'B2C' THEN 'B2C'
             ELSE 'Other'
           END as derived_group,
           SUM(COALESCE(f.fulfilled_revenue_amount_vnd, 0)) as revenue,
           SUM(COALESCE(f.gross_profit_vnd, f.fulfilled_revenue_amount_vnd - COALESCE(f.cogs_amount_vnd, 0), 0)) as margin
         FROM fact_fulfillment_revenue f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         ${whereClause}
         GROUP BY 1, 2, 3, 4
         ORDER BY 1 ASC`
      )

      // Group by period+derived_group (monthly and quarterly)
      function processRows(isQuarterly: boolean) {
        const grouped = new Map<string, { period: string; group_name: string; revenue: number; margin: number }>()

        rows.forEach(row => {
          const [yr, mo] = row.period.split("-")
          const period = isQuarterly ? `${yr}-Q${Math.ceil(parseInt(mo) / 3)}` : row.period
          const key = `${period}_${row.derived_group}`

          if (!grouped.has(key)) {
            grouped.set(key, { period, group_name: row.derived_group, revenue: 0, margin: 0 })
          }
          const item = grouped.get(key)!
          item.revenue += parseFloat(row.revenue || "0")
          item.margin  += parseFloat(row.margin  || "0")
        })

        return Array.from(grouped.values()).map(item => ({
          period:     item.period,
          group_name: item.group_name,
          revenue:    item.revenue,
          margin:     item.margin,
          gpm:        item.revenue > 0 ? (item.margin / item.revenue) * 100 : 0,
          gpm2_val:   item.margin,  // no channel costs data — GPM2 = GPM
          gpm2:       item.revenue > 0 ? (item.margin / item.revenue) * 100 : 0,
        }))
      }

      return { monthly: processRows(false), quarterly: processRows(true) }
    })

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[all-time-performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
