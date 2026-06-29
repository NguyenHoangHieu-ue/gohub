import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, getPrevDateFilter, getStrategicPartnersList , CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard } from "@/lib/analytics-helpers"
import { fetchCosts, getDaysInRange, getDaysInMonth, monthsBetween } from "@/lib/bod-data"

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

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

    return rows.map(r => {
      const rev  = parseFloat(r.revenue      || "0")
      const mar  = parseFloat(r.margin       || "0")
      const prv  = parseFloat(r.prev_revenue || "0")
      const grp  = r.group_name || ""

      // Op cost theo channel (channel_costs: ads/platform/sponsor/media)
      let opCost = 0
      channelCosts.filter(cc => cc.channel === r.channel).forEach(cc => {
        const ratio = getDaysInMonth(cc.month) > 0
          ? getDaysInRange(startDate || "", endDate || "", cc.month) / getDaysInMonth(cc.month) : 0
        COST_KEYS.forEach(key => {
          const v = (cc as any)[key]
          if (v) opCost += v.type === "amount" ? (v.value || 0) * ratio : (rev * (v.value || 0)) / 100
        })
      })
      // Op cost theo group (channel_group_costs: B2B / B2C — prorate theo ngày)
      const tursoGroup = grp.startsWith("B2B") ? "B2B" : grp.includes("B2C") ? "B2C" : grp
      groupCosts.filter(gc => gc.group_name === tursoGroup).forEach(gc => {
        const ratio = getDaysInMonth(gc.month) > 0
          ? getDaysInRange(startDate || "", endDate || "", gc.month) / getDaysInMonth(gc.month) : 0
        opCost += gc.amount * ratio
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
