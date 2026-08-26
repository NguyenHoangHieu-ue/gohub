import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter, getStrategicPartnersList , CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard } from "@/lib/analytics-helpers"
import { fetchCosts, getDaysInRange, getDaysInMonth, monthsBetween } from "@/lib/bod-data"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"
import { COST_KEYS, calcChCostForPeriod } from "@/lib/analytics-engine/cost-engine"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate    = searchParams.get("startDate")
  const endDate      = searchParams.get("endDate")
  const dateColumn   = searchParams.get("dateColumn")   || "fulfiled_date"
  const channelGroup = searchParams.get("channelGroup") || "All"

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter = getPrevDateFilter(startDate, endDate, "none", source.dateCol)
  const groupFilter = channelGroup !== "All"
    ? `AND UPPER(s.group_name) = '${channelGroup.toUpperCase()}'`
    : ""

  try {
    const key = `ch-perf:${dateColumn}:${startDate}:${endDate}:${channelGroup}`
    const payload = await cachedQuery(key, async () => {
    const strategicList = await getStrategicPartnersList()

    const rows = await queryAnalytics<Record<string, string>>(
      `WITH cur AS (
         SELECT TRIM(s.channel_name) as channel,
                UPPER(s.group_name) as group_name,
                CASE WHEN s.channel_name ILIKE ANY(ARRAY[${strategicList}]::text[]) THEN true ELSE false END as is_strategic,
                SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                SUM(f.${source.quantityCol}) as units,
                COUNT(DISTINCT f.order_code) as orders
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${filter} ${groupFilter}
         GROUP BY TRIM(s.channel_name), UPPER(s.group_name), is_strategic
       ),
       prv AS (
         SELECT TRIM(s.channel_name) as channel,
                SUM(f.${source.revenueCol}) as revenue
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${prevFilter} ${groupFilter}
         GROUP BY TRIM(s.channel_name)
       )
       SELECT c.channel, c.group_name, c.is_strategic,
              c.revenue, c.margin, c.units, c.orders,
              COALESCE(p.revenue, 0) as prev_revenue
       FROM cur c LEFT JOIN prv p ON c.channel = p.channel
       ORDER BY c.group_name, c.revenue DESC`
    )

    // Fetch op costs để tính CM1 = margin - opCost (y hệt bod-data pattern)
    const months = monthsBetween(startDate || "", endDate || "")
    const { channelCosts, groupCosts } = await fetchCosts(months)

    // Pre-compute revenue totals per business group → allocate group costs proportionally
    const groupRevTotals: Record<string, number> = {}
    rows.forEach(r => {
      const g = r.group_name || ""
      const k = g.startsWith("B2B") ? "B2B" : g.includes("B2C") ? "B2C" : g
      groupRevTotals[k] = (groupRevTotals[k] || 0) + parseFloat(r.revenue || "0")
    })

    // B2B per-customer cost (Turso b2b_customer_cost_monthly) — B2B KHÔNG dùng analytics_channel_costs
    // (tránh double-count với Turso, khớp Quarter Report/b2b-kpis). Phân bổ tổng cost B2B vào từng channel
    // theo revenue-share (giống cách group cost đang phân bổ ở dưới).
    let totalB2BTursoCost = 0
    if (groupRevTotals["B2B"] > 0) {
      const [custRevRows, customerCostMap] = await Promise.all([
        queryAnalytics<{ customer_code: string; month: string; revenue: string }>(`
          SELECT TRIM(f.customer_code) as customer_code, TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
                 SUM(f.${source.revenueCol}) as revenue
          FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE ${filter} AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
          GROUP BY 1, 2
        `),
        fetchCustomerCosts(months),
      ])
      const custRevMap = new Map<string, number>()
      custRevRows.forEach(r => custRevMap.set(`${r.month}_${r.customer_code}`, parseFloat(r.revenue || "0")))
      customerCostMap.forEach((rec, key) => {
        const mo = key.slice(0, 7); const code = key.slice(8)
        const custRev = custRevMap.get(`${mo}_${code}`) || 0
        if (custRev === 0) return
        const ratio = getDaysInMonth(mo) > 0 ? getDaysInRange(startDate || "", endDate || "", mo) / getDaysInMonth(mo) : 0
        totalB2BTursoCost += calcChCostForPeriod(rec, custRev, ratio)
      })
    }

    return rows.map(r => {
      const rev  = parseFloat(r.revenue      || "0")
      const mar  = parseFloat(r.margin       || "0")
      const prv  = parseFloat(r.prev_revenue || "0")
      const grp  = r.group_name || ""

      const isB2B = grp.startsWith("B2B")
      // Op cost theo channel (channel_costs: ads/platform/sponsor/media) — B2B KHÔNG dùng nguồn này
      // (dùng Turso per-customer cost thay thế, xem totalB2BTursoCost ở trên).
      let opCost = 0
      if (!isB2B) {
        channelCosts.filter(cc => cc.channel === r.channel).forEach(cc => {
          const ratio = getDaysInMonth(cc.month) > 0
            ? getDaysInRange(startDate || "", endDate || "", cc.month) / getDaysInMonth(cc.month) : 0
          COST_KEYS.forEach(key => {
            const v = (cc as any)[key]
            if (v) opCost += v.type === "amount" ? (v.value || 0) * ratio : (rev * (v.value || 0)) / 100
          })
        })
      }
      // Op cost theo group (channel_group_costs: B2B / B2C) — chia theo revenue share
      const tursoGroup = grp.startsWith("B2B") ? "B2B" : grp.includes("B2C") ? "B2C" : grp
      const revShare = (groupRevTotals[tursoGroup] || 0) > 0 ? rev / groupRevTotals[tursoGroup] : 0
      if (isB2B) opCost += totalB2BTursoCost * revShare
      groupCosts.filter(gc => gc.group_name === tursoGroup).forEach(gc => {
        const ratio = getDaysInMonth(gc.month) > 0
          ? getDaysInRange(startDate || "", endDate || "", gc.month) / getDaysInMonth(gc.month) : 0
        opCost += gc.amount * ratio * revShare
      })

      const gpm2 = mar - opCost
      return {
        channel:        r.channel,
        group_name:     grp,
        is_strategic:   r.is_strategic === "true" || String(r.is_strategic) === "true",
        revenue:        rev,
        margin:         mar,
        margin_percent: rev > 0 ? (mar / rev) * 100 : 0,
        gpm2,
        gpm2_percent:   rev > 0 ? (gpm2 / rev) * 100 : 0,
        units:          parseFloat(r.units  || "0"),
        orders:         parseInt(r.orders   || "0"),
        prev_revenue:   prv,
        mom:            prv === 0 ? 0 : ((rev - prv) / prv) * 100,
      }
    })
    }, QUERY_TTL_MIN)

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/channels/performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
