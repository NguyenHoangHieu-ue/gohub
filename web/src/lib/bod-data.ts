import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { getAnalyticsSource, getDateFilter, getStrategicPartnersList, getGroupCaseSQL } from "@/lib/analytics-helpers"

// Port y hệt gohub-intel server.ts fetchBODGroupMarginData + fetchBODChannelPerformanceData.
// GPM2 = margin − op-cost (channel_costs prorate ngày + group_costs theo nhóm). Cost lấy từ Supabase
// analytics_channel_costs / analytics_channel_group_costs (intel dùng Turso channel_costs; group_name web = 'B2B'/'B2C').

export function getDaysInMonth(month: string) {
  const d = new Date(`${month}-01`)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}
export function getDaysInRange(startDate: string, endDate: string, month: string) {
  const rangeStart = new Date(startDate); const rangeEnd = new Date(endDate)
  const mStart = new Date(`${month}-01`); const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0)
  const iStart = rangeStart > mStart ? rangeStart : mStart
  const iEnd = rangeEnd < mEnd ? rangeEnd : mEnd
  return iStart <= iEnd ? Math.ceil((iEnd.getTime() - iStart.getTime()) / 86400000) + 1 : 0
}
export function monthsBetween(startDate: string, endDate: string) {
  const start = new Date(startDate); const end = new Date(endDate)
  const m: string[] = []
  let curr = new Date(start.getFullYear(), start.getMonth(), 1)
  while (curr <= end) { m.push(curr.toISOString().slice(0, 7)); curr.setMonth(curr.getMonth() + 1) }
  return m
}
const parseJson = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : (v || {}) } catch { return {} } }

interface ChannelCost { channel: string; month: string; ads: any; platformFee: any; sponsorProducts: any; media: any }

async function fetchCosts(months: string[]): Promise<{ channelCosts: ChannelCost[]; groupCosts: any[] }> {
  if (months.length === 0) return { channelCosts: [], groupCosts: [] }
  const [{ data: ccData }, { data: gcData }] = await Promise.all([
    supabaseAdmin.from("analytics_channel_costs").select("channel, month, ads, platform_fee, sponsor_products, media").in("month", months),
    supabaseAdmin.from("analytics_channel_group_costs").select("group_name, month, amount").in("month", months),
  ])
  const channelCosts = (ccData || []).map((r: any) => ({
    channel: r.channel, month: String(r.month),
    ads: parseJson(r.ads), platformFee: parseJson(r.platform_fee), sponsorProducts: parseJson(r.sponsor_products), media: parseJson(r.media),
  }))
  return { channelCosts, groupCosts: (gcData || []).map((r: any) => ({ ...r, month: String(r.month), amount: parseFloat(r.amount || "0") })) }
}

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

export interface BODGroup {
  group: string; revenue: number; cogs: number; margin: number; units: number; orders: number
  margin_percent: number; gpm2: number; gpm2_percent: number
}

export async function fetchBODGroupMarginData(startDate: string, endDate: string, dateColumn = "fulfiled_date", extraFilters = "") {
  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate, endDate, source.dateCol)
  const strategicList = await getStrategicPartnersList()
  const groupCaseSQL = getGroupCaseSQL(strategicList)

  const rows = await queryAnalytics<Record<string, string>>(
    `WITH filtered_f AS (
       SELECT order_source_code, order_code, ${source.quantityCol}, ${source.revenueCol}, ${source.cogsCol}, ${source.marginCol}
       FROM ${source.mainTable} f WHERE ${filter} ${extraFilters}
     )
     SELECT ${groupCaseSQL} as "group", TRIM(s.channel_name) as channel,
            SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.cogsCol}) as cogs,
            SUM(f.${source.marginCol}) as margin, SUM(f.${source.quantityCol}) as units,
            COUNT(DISTINCT f.order_code) as orders
     FROM filtered_f f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
     GROUP BY 1, 2`
  )

  const months = monthsBetween(startDate, endDate)
  const { channelCosts, groupCosts } = await fetchCosts(months)

  const groupNames = ["B2B-Strategic", "B2B-Non-Strategic", "B2C", "Other"]
  const finalData: BODGroup[] = groupNames.map(groupName => {
    const groupRows = rows.filter(r => r.group === groupName)
    const revenue = groupRows.reduce((s, r) => s + parseFloat(r.revenue || "0"), 0)
    const cogs    = groupRows.reduce((s, r) => s + parseFloat(r.cogs || "0"), 0)
    const margin  = groupRows.reduce((s, r) => s + parseFloat(r.margin || "0"), 0)
    const units   = groupRows.reduce((s, r) => s + parseFloat(r.units || "0"), 0)
    const orders  = groupRows.reduce((s, r) => s + parseFloat(r.orders || "0"), 0)

    let opCost = 0
    groupRows.forEach(row => {
      const rev = parseFloat(row.revenue || "0")
      channelCosts.filter(c => c.channel === row.channel).forEach(c => {
        const ratio = getDaysInMonth(c.month) > 0 ? getDaysInRange(startDate, endDate, c.month) / getDaysInMonth(c.month) : 0
        COST_KEYS.forEach(key => {
          const v = (c as any)[key]
          if (v) opCost += v.type === "amount" ? (v.value || 0) * ratio : (rev * (v.value || 0)) / 100
        })
      })
    })
    // group-level costs: web group_name = 'B2B' cho mọi B2B*, 'B2C' cho B2C
    const tursoGroupName = groupName.startsWith("B2B") ? "B2B" : groupName
    opCost += groupCosts.filter(c => c.group_name === tursoGroupName).reduce((s, c) => {
      const ratio = getDaysInMonth(c.month) > 0 ? getDaysInRange(startDate, endDate, c.month) / getDaysInMonth(c.month) : 0
      return s + c.amount * ratio
    }, 0)

    const gpm2 = margin - opCost
    return {
      group: groupName, revenue, cogs, margin, units, orders,
      margin_percent: revenue > 0 ? (margin / revenue) * 100 : 0,
      gpm2, gpm2_percent: revenue > 0 ? (gpm2 / revenue) * 100 : 0,
    }
  }).filter(g => g.revenue > 0)

  const totalRevenue = finalData.reduce((s, g) => s + g.revenue, 0)
  const totalMargin  = finalData.reduce((s, g) => s + g.margin, 0)
  const totalGpm2    = finalData.reduce((s, g) => s + g.gpm2, 0)

  return {
    groups: finalData.sort((a, b) => b.revenue - a.revenue),
    summary: {
      total_revenue: totalRevenue,
      total_margin: totalMargin,
      total_gpm2: totalGpm2,
      avg_margin_percent: totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0,
      avg_gpm2_percent: totalRevenue > 0 ? (totalGpm2 / totalRevenue) * 100 : 0,
    },
  }
}

export async function fetchBODChannelPerformanceData(startDate: string, endDate: string, dateColumn = "fulfiled_date", extraFilters = "") {
  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate, endDate, source.dateCol)
  const strategicList = await getStrategicPartnersList()
  const groupCaseSQL = getGroupCaseSQL(strategicList)

  const rows = await queryAnalytics<Record<string, string>>(
    `WITH filtered_f AS (
       SELECT ${source.dateCol}, order_source_code, ${source.revenueCol}, ${source.cogsCol}, ${source.marginCol}, ${source.quantityCol}, order_code
       FROM ${source.mainTable} f WHERE ${filter} ${extraFilters}
     )
     SELECT ${groupCaseSQL} as "group", TRIM(s.channel_name) as channel,
            TO_CHAR(f.${source.dateCol}::DATE, 'YYYY-MM') as month,
            SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.cogsCol}) as cogs,
            SUM(f.${source.marginCol}) as margin, SUM(f.${source.quantityCol}) as units,
            COUNT(DISTINCT f.order_code) as orders
     FROM filtered_f f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
     GROUP BY 1, 2, 3
     ORDER BY 1, 2, 3`
  )

  const agg = new Map<string, any>()
  rows.forEach(row => {
    const key = row.channel
    if (!agg.has(key)) agg.set(key, { group: row.group, channel: row.channel, revenue: 0, cogs: 0, margin: 0, units: 0, orders: 0, monthly: [] as any[] })
    const ch = agg.get(key)
    ch.revenue += parseFloat(row.revenue || "0")
    ch.cogs    += parseFloat(row.cogs || "0")
    ch.margin  += parseFloat(row.margin || "0")
    ch.units   += parseFloat(row.units || "0")
    ch.orders  += parseInt(row.orders || "0")
    ch.monthly.push(row)
  })

  const months = monthsBetween(startDate, endDate)
  const { channelCosts } = await fetchCosts(months)

  return Array.from(agg.values()).map(row => {
    let opCost = 0
    row.monthly.forEach((mRow: any) => {
      const mRev = parseFloat(mRow.revenue || "0")
      channelCosts.filter(c => c.channel === row.channel && c.month === mRow.month).forEach(c => {
        const ratio = getDaysInMonth(c.month) > 0 ? getDaysInRange(startDate, endDate, c.month) / getDaysInMonth(c.month) : 0
        COST_KEYS.forEach(key => {
          const v = (c as any)[key]
          if (v) opCost += v.type === "amount" ? (v.value || 0) * ratio : (mRev * (v.value || 0)) / 100
        })
      })
    })
    const gpm2 = row.margin - opCost
    return {
      group: row.group, channel: row.channel, revenue: row.revenue, cogs: row.cogs, margin: row.margin,
      units: row.units, orders: row.orders,
      margin_percent: row.revenue > 0 ? (row.margin / row.revenue) * 100 : 0,
      gpm2, gpm2_percent: row.revenue > 0 ? (gpm2 / row.revenue) * 100 : 0,
    }
  })
}

// Port intel fetchBODReportData: breakdown theo NGÀY, GPM2 = dayMargin − op-cost rải đều theo ngày
// (amount: value/sốNgàyTháng; percent: dcRevenue*value/100) + group-cost/sốNgàyTháng.
export async function fetchBODReportData(startDate: string, endDate: string, extraFilters = "") {
  const filter = getDateFilter(startDate, endDate, "fulfiled_date")

  const [dailyRows, channelDaily, channelInfo] = await Promise.all([
    queryAnalytics<Record<string, string>>(
      `SELECT TO_CHAR(fulfiled_date::date, 'YYYY-MM-DD') as date,
              SUM(fulfilled_revenue_amount_vnd) as revenue, SUM(cogs_amount_vnd) as cogs,
              SUM(gross_profit_vnd) as margin,
              CASE WHEN SUM(fulfilled_revenue_amount_vnd) > 0 THEN (SUM(gross_profit_vnd) / SUM(fulfilled_revenue_amount_vnd)) * 100 ELSE 0 END as margin_percent
       FROM fact_fulfillment_revenue f WHERE ${filter} ${extraFilters} GROUP BY date ORDER BY date ASC`
    ),
    queryAnalytics<Record<string, string>>(
      `SELECT TO_CHAR(fulfiled_date::date, 'YYYY-MM-DD') as date, TRIM(s.channel_name) as channel,
              SUM(f.fulfilled_revenue_amount_vnd) as revenue
       FROM fact_fulfillment_revenue f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
       WHERE ${filter} ${extraFilters} GROUP BY date, channel`
    ),
    queryAnalytics<Record<string, string>>(
      `SELECT DISTINCT TRIM(channel_name) as channel, UPPER(group_name) as group_name FROM dim_order_source`
    ),
  ])

  const months = monthsBetween(startDate, endDate)
  const { channelCosts, groupCosts } = await fetchCosts(months)
  const strategicList = await getStrategicPartnersList()

  const getGroup = (channel: string, groupName: string) => {
    if (groupName === "B2B") {
      const isStrategic = strategicList !== "''" && strategicList.split(",").some(p => {
        const cleanP = p.replace(/'/g, "").replace(/%/g, "").toLowerCase()
        return cleanP && channel.toLowerCase().includes(cleanP)
      })
      return isStrategic ? "B2B-Strategic" : "B2B-Non-Strategic"
    }
    if (groupName === "B2C") return "B2C"
    return "Other"
  }
  const channelGroupMap = new Map(channelInfo.map(r => [r.channel, r.group_name]))

  return dailyRows.map(r => {
    const date = r.date
    const month = date.slice(0, 7)
    const monthDays = getDaysInMonth(month)
    const dayRevenue = parseFloat(r.revenue || "0")
    const dayMargin = parseFloat(r.margin || "0")
    const dayChannels = channelDaily.filter(cr => cr.date === date)

    let dayOpCost = 0
    dayChannels.forEach(dc => {
      const dcRev = parseFloat(dc.revenue || "0")
      channelCosts.filter(c => c.channel === dc.channel && c.month === month).forEach(c => {
        COST_KEYS.forEach(key => {
          const v = (c as any)[key]
          if (v) dayOpCost += v.type === "amount" ? (v.value || 0) / monthDays : (dcRev * (v.value || 0)) / 100
        })
      })
    })

    const dayGroups = Array.from(new Set(dayChannels.map(dc => getGroup(dc.channel, String(channelGroupMap.get(dc.channel) || "Other")))))
    dayGroups.forEach(groupName => {
      const tursoGroupName = groupName.startsWith("B2B") ? "B2B" : groupName
      const totalGroupMonthCost = groupCosts.filter(c => c.group_name === tursoGroupName && c.month === month).reduce((s, c) => s + c.amount, 0)
      dayOpCost += totalGroupMonthCost / monthDays
    })

    const gpm2 = dayMargin - dayOpCost
    return {
      date, revenue: dayRevenue, cogs: parseFloat(r.cogs || "0"), margin: dayMargin,
      margin_percent: parseFloat(r.margin_percent || "0"),
      gpm2, gpm2_percent: dayRevenue > 0 ? (gpm2 / dayRevenue) * 100 : 0,
    }
  })
}
