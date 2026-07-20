import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { cachedQuery, CACHE_HEADERS, getStrategicPartnersList, safeDate, noCache, analyticsGuard } from "@/lib/analytics-helpers"

const parseJson = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : (v || {}) } catch { return {} } }
const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

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

      // Op-cost (CM1) — port intel: channel_costs full-month + group_costs theo nhóm (KHÔNG prorate; period là tháng đủ).
      const months = Array.from(new Set(rows.map(r => r.period)))
      let channelCosts: any[] = []
      let groupCosts: any[] = []
      if (months.length > 0) {
        const [{ data: ccData }, { data: gcData }] = await Promise.all([
          supabaseAdmin.from("analytics_channel_costs").select("channel, month, ads, platform_fee, sponsor_products, media").in("month", months),
          supabaseAdmin.from("analytics_channel_group_costs").select("group_name, month, amount").in("month", months),
        ])
        channelCosts = (ccData || []).map((r: any) => ({
          channel: r.channel, month: String(r.month),
          ads: parseJson(r.ads), platformFee: parseJson(r.platform_fee), sponsorProducts: parseJson(r.sponsor_products), media: parseJson(r.media),
        }))
        groupCosts = (gcData || []).map((r: any) => ({ group_name: r.group_name, month: String(r.month), amount: parseFloat(r.amount || "0") }))
      }

      // Group by period+derived_group (monthly and quarterly)
      function processRows(isQuarterly: boolean) {
        const grouped = new Map<string, { period: string; group_name: string; revenue: number; margin: number; op_costs: number }>()

        rows.forEach(row => {
          const [yr, mo] = row.period.split("-")
          const period = isQuarterly ? `${yr}-Q${Math.ceil(parseInt(mo) / 3)}` : row.period
          const key = `${period}_${row.derived_group}`

          if (!grouped.has(key)) {
            grouped.set(key, { period, group_name: row.derived_group, revenue: 0, margin: 0, op_costs: 0 })
          }
          const item = grouped.get(key)!
          const rowRev = parseFloat(row.revenue || "0")
          item.revenue += rowRev
          item.margin  += parseFloat(row.margin  || "0")

          channelCosts.filter(c => c.channel === row.channel_name && c.month === row.period).forEach(c => {
            COST_KEYS.forEach(k => {
              const v = c[k]
              if (v) item.op_costs += v.type === "amount" ? (v.value || 0) : (rowRev * (v.value || 0)) / 100
            })
          })
        })

        // group costs: 1 lần/nhóm/tháng (web group_name 'B2B' cho B2B*, 'B2C', 'Other')
        months.forEach(m => {
          ["B2C", "B2B-Strategic", "B2B-Non-Strategic", "Other"].forEach(dg => {
            const [yr, mo] = m.split("-")
            const period = isQuarterly ? `${yr}-Q${Math.ceil(parseInt(mo) / 3)}` : m
            const item = grouped.get(`${period}_${dg}`)
            if (item) {
              const costGroupName = dg === "B2C" ? "B2C" : (dg.startsWith("B2B") ? "B2B" : "Other")
              item.op_costs += groupCosts.filter(c => c.group_name === costGroupName && c.month === m).reduce((s, c) => s + c.amount, 0)
            }
          })
        })

        return Array.from(grouped.values()).map(item => {
          const gpm2_val = item.margin - item.op_costs
          return {
            period:     item.period,
            group_name: item.group_name,
            revenue:    item.revenue,
            margin:     item.margin,
            gpm:        item.revenue > 0 ? (item.margin / item.revenue) * 100 : 0,
            gpm2_val,
            gpm2:       item.revenue > 0 ? (gpm2_val / item.revenue) * 100 : 0,
          }
        })
      }

      return { monthly: processRows(false), quarterly: processRows(true) }
    }, undefined, noCache(req))

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[all-time-performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
