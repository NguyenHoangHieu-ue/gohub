import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter,
  getSkuDestinationRule, getDestinationSQL, getCountryMappings,
  getMonthsInRange, getChannelCostsForMonths, getCostSettingsForMonths,
  CACHE_HEADERS,
} from "@/lib/analytics-helpers"

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get("startDate") || ""
  const endDate    = searchParams.get("endDate")   || ""
  const dateColumn = searchParams.get("dateColumn") || "fulfiled_date"
  const groupBy    = searchParams.get("groupBy")    || "channel"

  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate || null, endDate || null, source.dateCol)

  try {
    let selectClause = "f.channel_name as name"
    let joinClause = ""
    if (groupBy === "vendor") {
      selectClause = "v.vendor as name"
      joinClause = "LEFT JOIN dim_sku v ON f.sku = v.sku"
    } else if (groupBy === "destination") {
      const rule = await getSkuDestinationRule()
      selectClause = `${getDestinationSQL(rule)} as name`
    } else if (groupBy === "sku") {
      selectClause = "f.sku as name"
    } else if (groupBy === "customer") {
      selectClause = "COALESCE(c.name, NULLIF(TRIM(f.customer_code), ''), 'Unknown') as name"
      joinClause = "LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code)"
    } else if (groupBy === "staff") {
      selectClause = "COALESCE(st.name, NULLIF(TRIM(f.staff_code), ''), 'Unknown') as name"
      joinClause = "LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)"
    }

    const isChannelGroup = groupBy === "channel" || !groupBy
    const needsSubChannel = isChannelGroup || groupBy === "customer"

    const rows = await queryAnalytics<Record<string, string>>(
      `WITH b2b_raw AS (
         SELECT f.*, TRIM(s.channel_name) as channel_name, TRIM(s.sapo_name) as sub_channel
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2B' AND ${filter}
       )
       SELECT ${selectClause},
              MAX(f.channel_name) as channel,
              ${needsSubChannel ? "sub_channel," : "NULL as sub_channel,"}
              TO_CHAR(f.${source.dateCol}::DATE, 'YYYY-MM') as month,
              SUM(f.${source.revenueCol}) as revenue,
              SUM(f.${source.marginCol}) as margin,
              SUM(f.${source.quantityCol}) as units
       FROM b2b_raw f
       ${joinClause}
       GROUP BY 1, 3, 4`
    )

    // ── Aggregate in JS (name → totals + monthly + sub-channel breakdown) ───────
    type Item = {
      name: string; channel: string; revenue: number; margin: number; units: number
      monthly_data: Array<{ month: string; revenue: number; margin: number; units: number }>
      sub_channel_breakdown: Record<string, Record<string, { revenue: number; margin: number; units: number }>>
    }
    const aggregated = new Map<string, Item>()
    rows.forEach(r => {
      const key = r.name
      if (!aggregated.has(key)) {
        aggregated.set(key, { name: key, channel: r.channel, revenue: 0, margin: 0, units: 0, monthly_data: [], sub_channel_breakdown: {} })
      }
      const item = aggregated.get(key)!
      const revenue = parseFloat(r.revenue || "0")
      const margin  = parseFloat(r.margin || "0")
      const units   = parseFloat(r.units || "0")
      item.revenue += revenue; item.margin += margin; item.units += units

      let monthItem = item.monthly_data.find(m => m.month === r.month)
      if (!monthItem) { monthItem = { month: r.month, revenue: 0, margin: 0, units: 0 }; item.monthly_data.push(monthItem) }
      monthItem.revenue += revenue; monthItem.margin += margin; monthItem.units += units

      if (r.sub_channel) {
        if (!item.sub_channel_breakdown[r.month]) item.sub_channel_breakdown[r.month] = {}
        if (!item.sub_channel_breakdown[r.month][r.sub_channel]) item.sub_channel_breakdown[r.month][r.sub_channel] = { revenue: 0, margin: 0, units: 0 }
        const sc = item.sub_channel_breakdown[r.month][r.sub_channel]
        sc.revenue += revenue; sc.margin += margin; sc.units += units
      }
    })

    let finalRows = Array.from(aggregated.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 500)

    if (groupBy === "destination") {
      const mappings = await getCountryMappings()
      finalRows = finalRows.map(r => ({ ...r, name: mappings[r.name] || r.name }))
    }

    // ── Costs (no day-ratio for non-strategic, matching intel) ──────────────────
    const months = startDate && endDate ? getMonthsInRange(startDate, endDate) : []
    const channelCosts = await getChannelCostsForMonths(months)
    const settingsMap = await getCostSettingsForMonths(months)

    const result = finalRows.map(r => {
      const revenue = r.revenue
      const margin = r.margin
      let gpm2 = margin
      const subChannelPerformance: Record<string, { revenue: number; margin: number; units: number; gpm2: number }> = {}

      Object.values(r.sub_channel_breakdown).forEach(breakdown => {
        Object.entries(breakdown).forEach(([subName, metrics]) => {
          if (!subChannelPerformance[subName]) subChannelPerformance[subName] = { revenue: 0, margin: 0, units: 0, gpm2: 0 }
          subChannelPerformance[subName].revenue += metrics.revenue
          subChannelPerformance[subName].margin  += metrics.margin
          subChannelPerformance[subName].units   += metrics.units
          subChannelPerformance[subName].gpm2    += metrics.margin
        })
      })

      r.monthly_data.forEach(monthRow => {
        const mRev = monthRow.revenue
        const mMonth = monthRow.month
        const mode = settingsMap.get(`${r.name}_${mMonth}`) || "total"

        if (mode === "subchannels") {
          channelCosts.filter(c => c.channel.startsWith(`${r.name} - `) && c.month === mMonth).forEach(c => {
            const subName = c.channel.replace(`${r.name} - `, "")
            const subRev = r.sub_channel_breakdown[mMonth]?.[subName]?.revenue || 0
            COST_KEYS.forEach(key => {
              const cv = c[key]
              if (cv) {
                const amount = cv.type === "amount" ? (cv.value || 0) : (subRev * (cv.value || 0)) / 100
                gpm2 -= amount
                if (subChannelPerformance[subName]) subChannelPerformance[subName].gpm2 -= amount
              }
            })
          })
        } else {
          channelCosts.filter(c => c.channel === r.name && c.month === mMonth).forEach(c => {
            COST_KEYS.forEach(key => {
              const cv = c[key]
              if (cv) gpm2 -= cv.type === "amount" ? (cv.value || 0) : (mRev * (cv.value || 0)) / 100
            })
          })
        }
      })

      const sub_channels = Object.entries(subChannelPerformance).map(([name, m]) => ({
        name, revenue: m.revenue, margin: m.margin, units: m.units, gpm2: m.gpm2,
        margin_percent: m.revenue > 0 ? (m.margin / m.revenue) * 100 : 0,
        gpm2_percent: m.revenue > 0 ? (m.gpm2 / m.revenue) * 100 : 0,
      })).sort((a, b) => b.revenue - a.revenue)

      return {
        name: r.name, channel: r.channel, revenue, margin, units: r.units,
        margin_percent: revenue > 0 ? (margin / revenue) * 100 : 0,
        gpm2, gpm2_percent: revenue > 0 ? (gpm2 / revenue) * 100 : 0,
        sub_channels,
      }
    })

    return NextResponse.json(result, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2b/performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
