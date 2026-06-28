import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, getPrevDateFilter, getPartnerTiers,
  getMonthsInRange, getChannelCostsForMonths, getCostSettingsForMonths,
  getDaysInRange, getDaysInMonth, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard,
} from "@/lib/analytics-helpers"

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

type Metrics = { revenue: number; margin: number; units: number; orders?: number }
type Item = {
  name: string; tier: string; revenue: number; margin: number; units: number; orders: number
  prev_revenue: number
  monthly_data: Array<{ month: string; revenue: number; margin: number; units: number; orders: number }>
  channel_contributions: Record<string, { revenue: number; units: number; orders: number; margin: number }>
  sub_channel_breakdown: Record<string, Record<string, Metrics>>
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate") || ""
  const endDate     = searchParams.get("endDate")   || ""
  const dateColumn  = searchParams.get("dateColumn") || "fulfiled_date"
  const companyCode = searchParams.get("companyCode") || undefined

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate || null, endDate || null, source.dateCol, "30 days", companyCode)
  const prevFilter = getPrevDateFilter(startDate || null, endDate || null, "none", source.dateCol, "30 days", companyCode)

  try {
   const key = `b2b-strategic:${dateColumn}:${startDate}:${endDate}:${companyCode ?? ""}`
   const result = await cachedQuery(key, async () => {
    const tiers = await getPartnerTiers()
    const partnerMap   = new Map<string, string>() // lower(name) -> tier
    const reversedMap  = new Map<string, string>() // lower(name) -> original name
    Object.entries(tiers).forEach(([tier, names]) => {
      if (Array.isArray(names)) names.forEach(name => {
        const lower = name.trim().toLowerCase()
        partnerMap.set(lower, tier)
        reversedMap.set(lower, name.trim())
      })
    })
    const partnerNamesLower = Array.from(partnerMap.keys())
    if (partnerNamesLower.length === 0) return [] as any[]

    const arrLit = partnerNamesLower.map(n => `'${n.replace(/'/g, "''")}'`).join(",")

    const rows = await queryAnalytics<Record<string, string>>(
      `WITH raw_data AS (
         SELECT f.*, TRIM(s.channel_name) as channel_name, TRIM(s.sapo_name) as sub_channel,
                COALESCE(TRIM(c.name), NULLIF(TRIM(f.customer_code), ''), 'Unknown') as customer_name,
                CASE WHEN ${filter} THEN 'current' ELSE 'previous' END as period
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code)
         WHERE (${filter} OR ${prevFilter})
       ),
       matched_data AS (
         SELECT r.*,
           CASE
             WHEN LOWER(customer_name) = ANY(ARRAY[${arrLit}]) THEN LOWER(customer_name)
             WHEN LOWER(channel_name)  = ANY(ARRAY[${arrLit}]) THEN LOWER(channel_name)
             ELSE NULL
           END as matched_partner
         FROM raw_data r
       )
       SELECT matched_partner as name, period, channel_name as channel,
              TO_CHAR(${source.dateCol}::DATE, 'YYYY-MM') as month,
              SUM(${source.revenueCol}) as revenue,
              SUM(${source.marginCol}) as margin,
              SUM(${source.quantityCol}) as units,
              COUNT(DISTINCT order_code) as orders
       FROM matched_data
       WHERE matched_partner IS NOT NULL
       GROUP BY 1, 2, 3, 4`
    )

    const aggregated = new Map<string, Item>()
    partnerMap.forEach((tier, key) => {
      aggregated.set(key, {
        name: reversedMap.get(key) || key, tier, revenue: 0, margin: 0, units: 0, orders: 0,
        prev_revenue: 0, monthly_data: [], channel_contributions: {}, sub_channel_breakdown: {},
      })
    })

    rows.forEach(r => {
      const key = r.name
      if (!aggregated.has(key)) {
        aggregated.set(key, {
          name: reversedMap.get(key) || key, tier: partnerMap.get(key) || "Other",
          revenue: 0, margin: 0, units: 0, orders: 0, prev_revenue: 0,
          monthly_data: [], channel_contributions: {}, sub_channel_breakdown: {},
        })
      }
      const item = aggregated.get(key)!
      const revenue = parseFloat(r.revenue || "0")
      const margin  = parseFloat(r.margin || "0")
      const units   = parseFloat(r.units || "0")
      const orders  = parseInt(r.orders || "0")

      if (r.period === "current") {
        item.revenue += revenue; item.margin += margin; item.units += units; item.orders += orders
        if (r.channel) {
          if (!item.channel_contributions[r.channel]) item.channel_contributions[r.channel] = { revenue: 0, units: 0, orders: 0, margin: 0 }
          const cc = item.channel_contributions[r.channel]
          cc.revenue += revenue; cc.units += units; cc.orders += orders; cc.margin += margin
        }
        let monthItem = item.monthly_data.find(m => m.month === r.month)
        if (!monthItem) { monthItem = { month: r.month, revenue: 0, margin: 0, units: 0, orders: 0 }; item.monthly_data.push(monthItem) }
        monthItem.revenue += revenue; monthItem.margin += margin; monthItem.units += units; monthItem.orders += orders

        if (r.sub_channel) {
          if (!item.sub_channel_breakdown[r.month]) item.sub_channel_breakdown[r.month] = {}
          if (!item.sub_channel_breakdown[r.month][r.sub_channel]) item.sub_channel_breakdown[r.month][r.sub_channel] = { revenue: 0, margin: 0, units: 0, orders: 0 }
          const sc = item.sub_channel_breakdown[r.month][r.sub_channel]
          sc.revenue += revenue; sc.margin += margin; sc.units += units; sc.orders = (sc.orders || 0) + orders
        }
      } else {
        item.prev_revenue += revenue
      }
    })

    const months = startDate && endDate ? getMonthsInRange(startDate, endDate) : []
    const channelCosts = await getChannelCostsForMonths(months)
    const settingsMap = await getCostSettingsForMonths(months)

    const result = Array.from(aggregated.values()).map(r => {
      const revenue = r.revenue
      const margin = r.margin
      const mom = r.prev_revenue > 0 ? ((revenue - r.prev_revenue) / r.prev_revenue) * 100 : 0
      let gpm2 = margin
      const cost_breakdown: Record<string, number> = { ads: 0, platformFee: 0, sponsorProducts: 0, media: 0 }

      r.monthly_data.forEach(monthRow => {
        const mRev = monthRow.revenue
        const mMonth = monthRow.month
        const mode = settingsMap.get(`${r.name}_${mMonth}`) || "total"
        const ratio = getDaysInMonth(mMonth) > 0 ? getDaysInRange(startDate, endDate, mMonth) / getDaysInMonth(mMonth) : 0

        if (mode === "subchannels") {
          channelCosts.filter(c => c.channel.startsWith(`${r.name} - `) && c.month === mMonth).forEach(c => {
            const subName = c.channel.replace(`${r.name} - `, "")
            const subRev = r.sub_channel_breakdown[mMonth]?.[subName]?.revenue || 0
            COST_KEYS.forEach(key => {
              const cv = c[key]
              if (cv) {
                const costVal = cv.type === "amount" ? (cv.value || 0) * ratio : (subRev * (cv.value || 0)) / 100
                gpm2 -= costVal; cost_breakdown[key] += costVal
              }
            })
          })
        } else {
          channelCosts.filter(c => c.channel === r.name && c.month === mMonth).forEach(c => {
            COST_KEYS.forEach(key => {
              const cv = c[key]
              if (cv) {
                const costVal = cv.type === "amount" ? (cv.value || 0) * ratio : (mRev * (cv.value || 0)) / 100
                gpm2 -= costVal; cost_breakdown[key] += costVal
              }
            })
          })
        }
      })

      const subChannelsArray: Array<{ name: string; revenue: number; margin: number; units: number; gpm2: number }> = []
      Object.keys(r.sub_channel_breakdown).forEach(month => {
        Object.entries(r.sub_channel_breakdown[month]).forEach(([subName, sm]) => {
          let sub = subChannelsArray.find(s => s.name === subName)
          if (!sub) { sub = { name: subName, revenue: 0, margin: 0, units: 0, gpm2: 0 }; subChannelsArray.push(sub) }
          sub.revenue += sm.revenue; sub.margin += sm.margin; sub.units += sm.units; sub.gpm2 += sm.margin
        })
      })
      r.monthly_data.forEach(monthRow => {
        const mMonth = monthRow.month
        const mode = settingsMap.get(`${r.name}_${mMonth}`) || "total"
        const ratio = getDaysInMonth(mMonth) > 0 ? getDaysInRange(startDate, endDate, mMonth) / getDaysInMonth(mMonth) : 0
        if (mode === "subchannels") {
          channelCosts.filter(c => c.channel.startsWith(`${r.name} - `) && c.month === mMonth).forEach(c => {
            const subName = c.channel.replace(`${r.name} - `, "")
            const sub = subChannelsArray.find(s => s.name === subName)
            if (sub) {
              const subRev = r.sub_channel_breakdown[mMonth]?.[subName]?.revenue || 0
              COST_KEYS.forEach(key => {
                const cv = c[key]
                if (cv) sub.gpm2 -= cv.type === "amount" ? (cv.value || 0) * ratio : (subRev * (cv.value || 0)) / 100
              })
            }
          })
        }
      })

      return {
        name: r.name, tier: r.tier, revenue, margin, units: r.units, orders: r.orders, mom,
        prev_revenue: r.prev_revenue, channel_contributions: r.channel_contributions,
        margin_percent: revenue > 0 ? (margin / revenue) * 100 : 0,
        gpm2, gpm2_percent: revenue > 0 ? (gpm2 / revenue) * 100 : 0,
        sub_channels: subChannelsArray.map(sc => ({
          ...sc,
          margin_percent: sc.revenue > 0 ? (sc.margin / sc.revenue) * 100 : 0,
          gpm2_percent: sc.revenue > 0 ? (sc.gpm2 / sc.revenue) * 100 : 0,
        })).sort((a, b) => b.revenue - a.revenue),
        cost_breakdown,
      }
    }).sort((a, b) => b.revenue - a.revenue)

    return result
   }, QUERY_TTL_MIN)

   return NextResponse.json(result, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2b/strategic-performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
