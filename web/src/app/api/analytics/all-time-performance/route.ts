import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { cachedQuery, CACHE_HEADERS, getCustomerStrategicSql, safeDate, noCache, analyticsGuard, shipFilter, internalOpsFilter } from "@/lib/analytics-helpers"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"
import { calcChCostForPeriod } from "@/lib/analytics-engine/cost-engine"

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

  // Strategic/Non theo KHÁCH (price_list_name), cấu hình chung quarterly-settings (ISSUE-DASH-4, s131).
  const includeShip        = p.get("includeShip")        === "1"
  const includeInternalOps = p.get("includeInternalOps") === "1"
  const { isStrategicSql, excludeSql: excludeList, hash } = await getCustomerStrategicSql()
  const cacheKey = `all-time2:${startDate}:${endDate}:${channelGroup}:${customerTier}:${channel}:${hash}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}`

  try {
    const data = await cachedQuery(cacheKey, async () => {
      let whereClause = `WHERE f.fulfiled_date::date >= '${startDate}' AND f.fulfiled_date::date <= LEAST('${endDate}'::date, CURRENT_DATE - 1) ${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)}`

      if (channelGroup) {
        const grp = channelGroup.toUpperCase().replace(/'/g, "''")
        whereClause += ` AND UPPER(COALESCE(s.group_name, 'Other')) = '${grp}'`
        if (grp === "B2B" && customerTier) {
          const tier = customerTier.toLowerCase()
          if (tier === "strategic") {
            whereClause += ` AND ${isStrategicSql} AND COALESCE(c.name, TRIM(f.customer_code)) NOT IN (${excludeList})`
          } else if (tier.includes("non")) {
            whereClause += ` AND NOT ${isStrategicSql} AND COALESCE(c.name, TRIM(f.customer_code)) NOT IN (${excludeList})`
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
             WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' AND COALESCE(c.name, TRIM(f.customer_code)) IN (${excludeList}) THEN 'Excluded'
             WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' AND ${isStrategicSql} THEN 'B2B-Strategic'
             WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' THEN 'B2B-Non-Strategic'
             WHEN UPPER(COALESCE(s.group_name,'')) = 'B2C' THEN 'B2C'
             ELSE 'Other'
           END as derived_group,
           SUM(COALESCE(f.fulfilled_revenue_amount_vnd, 0)) as revenue,
           SUM(COALESCE(f.gross_profit_vnd, f.fulfilled_revenue_amount_vnd - COALESCE(f.cogs_amount_vnd, 0), 0)) as margin
         FROM fact_fulfillment_revenue f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
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

      // Revenue-share theo (tháng, channel) để chia amount-type channel cost khi 1 channel span 2 tier KH.
      const channelPeriodRev: Record<string, number> = {}
      rows.forEach(r => { const k = `${r.period}_${r.channel_name}`; channelPeriodRev[k] = (channelPeriodRev[k] || 0) + parseFloat(r.revenue || "0") })

      // B2B per-customer cost (Turso b2b_customer_cost_monthly) — B2B KHÔNG dùng analytics_channel_costs
      // (tránh double-count, khớp Quarter Report/bod-group-margin). Cần revenue theo KH×tháng, CÙNG phân loại
      // Strategic/Non-Strategic để cộng đúng nhóm derived_group.
      const b2bTursoCostByMonthGroup: Record<string, number> = {}
      if (months.length > 0) {
        const custRevRows = await queryAnalytics<{ customer_code: string; period: string; derived_group: string; revenue: string }>(
          `SELECT TRIM(f.customer_code) as customer_code, TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') as period,
                  CASE
                    WHEN COALESCE(c.name, TRIM(f.customer_code)) IN (${excludeList}) THEN 'Excluded'
                    WHEN ${isStrategicSql} THEN 'B2B-Strategic'
                    ELSE 'B2B-Non-Strategic'
                  END as derived_group,
                  SUM(COALESCE(f.fulfilled_revenue_amount_vnd, 0)) as revenue
           FROM fact_fulfillment_revenue f
           LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
           ${whereClause}
           AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
           GROUP BY 1, 2, 3`
        )
        const custRevMap = new Map<string, number>()
        const custGroupMap = new Map<string, string>()
        custRevRows.forEach(r => {
          custRevMap.set(`${r.period}_${r.customer_code}`, parseFloat(r.revenue || "0"))
          custGroupMap.set(`${r.period}_${r.customer_code}`, r.derived_group)
        })
        const customerCostMap = await fetchCustomerCosts(months)
        customerCostMap.forEach((rec, key) => {
          const month = key.slice(0, 7), code = key.slice(8)
          const custRev = custRevMap.get(`${month}_${code}`) || 0
          if (custRev === 0) return
          const dg = custGroupMap.get(`${month}_${code}`)
          if (dg !== "B2B-Strategic" && dg !== "B2B-Non-Strategic") return
          const cost = calcChCostForPeriod(rec, custRev, 1)  // period là tháng đủ (như channel/group cost khác) — KHÔNG prorate
          const bucket = `${month}_${dg}`
          b2bTursoCostByMonthGroup[bucket] = (b2bTursoCostByMonthGroup[bucket] || 0) + cost
        })
      }

      // Group by period+derived_group (monthly and quarterly)
      function processRows(isQuarterly: boolean) {
        const grouped = new Map<string, { period: string; group_name: string; revenue: number; margin: number; op_costs: number }>()

        rows.forEach(row => {
          if (row.derived_group === "Excluded") return   // ops/B2C-in-B2B (doanh thu ~0) — không tính vào group
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

          if (!row.derived_group.startsWith("B2B")) {
            // amount channel cost: chia theo revenue-share (channel span 2 tier trong tháng) → tránh cộng 2 lần.
            // B2B bỏ qua — dùng Turso per-customer cost (b2bTursoCostByMonthGroup) ở dưới, tránh double-count.
            const chShare = channelPeriodRev[`${row.period}_${row.channel_name}`] > 0 ? rowRev / channelPeriodRev[`${row.period}_${row.channel_name}`] : 0
            channelCosts.filter(c => c.channel === row.channel_name && c.month === row.period).forEach(c => {
              COST_KEYS.forEach(k => {
                const v = c[k]
                if (!v) return
                item.op_costs += v.type === "amount" ? (v.value || 0) * chShare : (rowRev * (v.value || 0)) / 100
              })
            })
          }
        })

        // B2B per-customer cost (Turso) — cộng vào đúng bucket period+derived_group.
        months.forEach(m => {
          const [yr, mo] = m.split("-")
          const period = isQuarterly ? `${yr}-Q${Math.ceil(parseInt(mo) / 3)}` : m
          ;["B2B-Strategic", "B2B-Non-Strategic"].forEach(dg => {
            const item = grouped.get(`${period}_${dg}`)
            if (item) item.op_costs += b2bTursoCostByMonthGroup[`${m}_${dg}`] || 0
          })
        })

        // group costs: 1 lần/nhóm/tháng (web group_name 'B2B' cho B2B*, 'B2C', 'Other').
        // BOD-1: B2B group cost chia theo revenue-share giữa B2B-Strategic & B2B-Non-Strategic (KHÔNG cộng
        // đầy đủ 2 lần). B2C/Other share=1.
        months.forEach(m => {
          const [yr, mo] = m.split("-")
          const period = isQuarterly ? `${yr}-Q${Math.ceil(parseInt(mo) / 3)}` : m
          const b2bTotalRev = (grouped.get(`${period}_B2B-Strategic`)?.revenue || 0) + (grouped.get(`${period}_B2B-Non-Strategic`)?.revenue || 0)
          ;["B2C", "B2B-Strategic", "B2B-Non-Strategic", "Other"].forEach(dg => {
            const item = grouped.get(`${period}_${dg}`)
            if (item) {
              const costGroupName = dg === "B2C" ? "B2C" : (dg.startsWith("B2B") ? "B2B" : "Other")
              const monthCost = groupCosts.filter(c => c.group_name === costGroupName && c.month === m).reduce((s, c) => s + c.amount, 0)
              const share = dg.startsWith("B2B") ? (b2bTotalRev > 0 ? item.revenue / b2bTotalRev : 0) : 1
              item.op_costs += monthCost * share
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
    }, undefined, noCache(req), ["b2b-cost"])

    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[all-time-performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
