import { queryAnalytics } from "@/lib/analytics-db"
import { supabaseAdmin } from "@/lib/supabase"
import { getAnalyticsSource, getDateFilter, getStrategicPartnersList, getGroupCaseSQL, getCustomerStrategicSql, shipFilter, internalOpsFilterByCode } from "@/lib/analytics-helpers"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"
import { calcChCostForPeriod } from "@/lib/analytics-engine/cost-engine"
import { getDaysInMonth, getDaysInRange } from "@/lib/analytics-engine/date-math"

// Port y hệt gohub-intel server.ts fetchBODGroupMarginData + fetchBODChannelPerformanceData.
// CM1 = margin − op-cost (channel_costs prorate ngày + group_costs theo nhóm). Cost lấy từ Supabase
// analytics_channel_costs / analytics_channel_group_costs (intel dùng Turso channel_costs; group_name web = 'B2B'/'B2C').

// Nguồn thật: analytics-engine/date-math.ts. Bản cũ ở đây (đã xoá) tự parse `new Date(`${month}-01`)`
// (UTC) rồi đọc lại `.getFullYear()/.getMonth()` (LOCAL) — lệch tháng trên máy có timezone offset âm
// (vd US); date-math.ts parse Y/M/D thuần số, không còn phụ thuộc timezone máy chạy (s183 Phase 2).
export { getDaysInMonth, getDaysInRange }

export function monthsBetween(startDate: string, endDate: string) {
  const start = new Date(startDate); const end = new Date(endDate)
  const m: string[] = []
  let curr = new Date(start.getFullYear(), start.getMonth(), 1)
  while (curr <= end) { m.push(curr.toISOString().slice(0, 7)); curr.setMonth(curr.getMonth() + 1) }
  return m
}
const parseJson = (v: unknown) => { try { return typeof v === "string" ? JSON.parse(v) : (v || {}) } catch { return {} } }

interface ChannelCost {
  channel: string; month: string
  source_code?: string  // dim_order_source.code — ổn định khi channel đổi tên
  ads: any; platformFee: any; sponsorProducts: any; media: any
}

export async function fetchCosts(months: string[]): Promise<{ channelCosts: ChannelCost[]; groupCosts: any[] }> {
  if (months.length === 0) return { channelCosts: [], groupCosts: [] }
  const [{ data: ccData }, { data: gcData }] = await Promise.all([
    supabaseAdmin.from("analytics_channel_costs").select("channel, month, source_code, ads, platform_fee, sponsor_products, media").in("month", months),
    supabaseAdmin.from("analytics_channel_group_costs").select("group_name, month, amount").in("month", months),
  ])
  const channelCosts = (ccData || []).map((r: any) => ({
    channel: r.channel, month: String(r.month), source_code: r.source_code || undefined,
    ads: parseJson(r.ads), platformFee: parseJson(r.platform_fee), sponsorProducts: parseJson(r.sponsor_products), media: parseJson(r.media),
  }))
  return { channelCosts, groupCosts: (gcData || []).map((r: any) => ({ ...r, month: String(r.month), amount: parseFloat(r.amount || "0") })) }
}

/** Match channel cost — permanent fix cho channel rename.
 *
 * Thứ tự ưu tiên:
 * 1. Sub-channel prefix: tìm tất cả record "Channel - *" cho tháng đó
 *    → nếu có → dùng CHÚNG (không dùng aggregate để tránh double-count)
 *    → bắt trọn Shopee/TikTok/Lazada kể cả khi source_code khác nhau
 * 2. Source_code match: nếu không có sub-channel record → tìm theo source_code
 * 3. Exact name match: fallback cuối cùng
 *
 * Ví dụ: "VN-Ecom" có sub-records "VN-Ecom - Shopee", "VN-Ecom - TiktokShop", "VN-Ecom - Lazada"
 *   → priority 1 tìm cả 3 → tổng hợp đúng, không lẫn với aggregate "VN-Ecom"
 */
export function matchChannelCost(
  channelCosts: ChannelCost[], channel: string, month: string, sourceCode?: string
): ChannelCost[] {
  const subPrefix = channel + " - "

  // 1. Sub-channel prefix match (catches renamed sub-channels like "VN-Ecom - Shopee")
  const subRecords = channelCosts.filter(c => c.month === month && c.channel.startsWith(subPrefix))
  if (subRecords.length > 0) return subRecords   // found sub-channels → use only them

  // 2. Source_code match (for renamed channels with stable code)
  if (sourceCode) {
    const byCode = channelCosts.filter(c => c.month === month && c.source_code === sourceCode)
    if (byCode.length > 0) return byCode
  }

  // 3. Exact name match
  const exact = channelCosts.filter(c => c.month === month && c.channel === channel)
  if (exact.length > 0) return exact

  // 4. Case-insensitive fallback — xử lý tên kênh khác case giữa analytics_channel_costs và dim_order_source
  //    (vd "VN-Ecom" vs "vn-ecom" hoặc "Traveloka" vs "TRAVELOKA")
  const norm = channel.toLowerCase().trim()
  return channelCosts.filter(c => c.month === month && c.channel.toLowerCase().trim() === norm)
}

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

export interface BODGroup {
  group: string; revenue: number; cogs: number; margin: number; units: number; orders: number
  margin_percent: number; gpm2: number; gpm2_percent: number
}

export async function fetchBODGroupMarginData(startDate: string, endDate: string, dateColumn = "fulfiled_date", extraFilters = "", includeShip = false, includeInternalOps = false) {
  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate, endDate, source.dateCol)
  // Strategic/Non phân theo KHÁCH (price_list_name), cấu hình chung quarterly-settings (ISSUE-DASH-4, s131).
  const { groupCaseSql: groupCaseSQL } = await getCustomerStrategicSql()
  const sfx = `${shipFilter(includeShip)} ${internalOpsFilterByCode(includeInternalOps)}`

  const rows = await queryAnalytics<Record<string, string>>(
    `WITH filtered_f AS (
       SELECT sku, order_source_code, customer_code, order_code, ${source.quantityCol}, ${source.revenueCol}, ${source.cogsCol}, ${source.marginCol}
       FROM ${source.mainTable} f WHERE ${filter} ${extraFilters} ${sfx}
     )
     SELECT ${groupCaseSQL} as "group", TRIM(s.channel_name) as channel,
            SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.cogsCol}) as cogs,
            SUM(f.${source.marginCol}) as margin, SUM(f.${source.quantityCol}) as units,
            COUNT(DISTINCT f.order_code) as orders
     FROM filtered_f f
     LEFT JOIN dim_order_source s ON f.order_source_code = s.code
     LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
     GROUP BY 1, 2`
  )

  const months = monthsBetween(startDate, endDate)
  const { channelCosts, groupCosts } = await fetchCosts(months)

  // B2B per-customer cost (Turso b2b_customer_cost_monthly) — B2B KHÔNG dùng analytics_channel_costs
  // (tránh double-count, khớp Quarter Report/b2b-kpis/b2b-performance). Cần revenue theo KH×tháng, CÙNG
  // phân loại Strategic/Non-Strategic (groupCaseSQL) để cộng đúng nhóm.
  const custRevRows = await queryAnalytics<Record<string, string>>(
    `WITH filtered_f AS (
       SELECT sku, order_source_code, customer_code, order_code, ${source.dateCol}, ${source.quantityCol}, ${source.revenueCol}, ${source.cogsCol}, ${source.marginCol}
       FROM ${source.mainTable} f WHERE ${filter} ${extraFilters} ${sfx}
     )
     SELECT ${groupCaseSQL} as "group", TRIM(f.customer_code) as customer_code,
            TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
            SUM(f.${source.revenueCol}) as revenue
     FROM filtered_f f
     LEFT JOIN dim_order_source s ON f.order_source_code = s.code
     LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
     WHERE ${groupCaseSQL} IN ('B2B-Strategic', 'B2B-Non-Strategic')
     GROUP BY 1, 2, 3`
  )
  const custRevMap = new Map<string, number>()
  custRevRows.forEach(r => custRevMap.set(`${r.month}_${r.customer_code}`, parseFloat(r.revenue || "0")))
  const customerCostMap = await fetchCustomerCosts(months)
  const b2bTursoCostByGroup: Record<string, number> = { "B2B-Strategic": 0, "B2B-Non-Strategic": 0 }
  customerCostMap.forEach((rec, key) => {
    const month = key.slice(0, 7), code = key.slice(8)
    const custRev = custRevMap.get(`${month}_${code}`) || 0
    if (custRev === 0) return
    const custGroup = custRevRows.find(r => r.month === month && r.customer_code === code)?.group
    if (!custGroup || !(custGroup in b2bTursoCostByGroup)) return
    const ratio = getDaysInMonth(month) > 0 ? getDaysInRange(startDate, endDate, month) / getDaysInMonth(month) : 0
    b2bTursoCostByGroup[custGroup] += calcChCostForPeriod(rec, custRev, ratio)
  })

  // 1 channel có thể chứa cả KH Strategic lẫn Non → xuất hiện ở 2 group. Amount-type channel cost (cố định theo
  // channel) chia theo revenue-share để KHÔNG cộng 2 lần; percent-type đã theo revenue nên đúng sẵn.
  const channelTotalRev: Record<string, number> = {}
  rows.forEach(r => { channelTotalRev[r.channel] = (channelTotalRev[r.channel] || 0) + parseFloat(r.revenue || "0") })

  const groupNames = ["B2B-Strategic", "B2B-Non-Strategic", "B2C", "Other"]
  // BOD-1: group cost theo tursoGroupName ('B2B' dùng chung cho Strategic+Non-Strategic) phải chia theo
  // revenue-share giữa các subgroup để KHÔNG cộng ĐẦY ĐỦ 2 lần. Precompute tổng revenue mỗi tursoGroupName.
  const groupRevenueMap: Record<string, number> = {}
  groupNames.forEach(g => { groupRevenueMap[g] = rows.filter(r => r.group === g).reduce((s, r) => s + parseFloat(r.revenue || "0"), 0) })
  const tursoRevenueMap: Record<string, number> = {}
  groupNames.forEach(g => { const t = g.startsWith("B2B") ? "B2B" : g; tursoRevenueMap[t] = (tursoRevenueMap[t] || 0) + groupRevenueMap[g] })

  const finalData: BODGroup[] = groupNames.map(groupName => {
    const groupRows = rows.filter(r => r.group === groupName)
    const revenue = groupRows.reduce((s, r) => s + parseFloat(r.revenue || "0"), 0)
    const cogs    = groupRows.reduce((s, r) => s + parseFloat(r.cogs || "0"), 0)
    const margin  = groupRows.reduce((s, r) => s + parseFloat(r.margin || "0"), 0)
    const units   = groupRows.reduce((s, r) => s + parseFloat(r.units || "0"), 0)
    const orders  = groupRows.reduce((s, r) => s + parseFloat(r.orders || "0"), 0)

    let opCost = 0
    if (groupName.startsWith("B2B")) {
      // B2B: Turso per-customer cost thay analytics_channel_costs (tránh double-count).
      opCost += b2bTursoCostByGroup[groupName] || 0
    } else {
      groupRows.forEach(row => {
        const rev = parseFloat(row.revenue || "0")
        const chShare = channelTotalRev[row.channel] > 0 ? rev / channelTotalRev[row.channel] : 0
        channelCosts.filter(c => c.channel === row.channel).forEach(c => {
          const ratio = getDaysInMonth(c.month) > 0 ? getDaysInRange(startDate, endDate, c.month) / getDaysInMonth(c.month) : 0
          COST_KEYS.forEach(key => {
            const v = (c as any)[key]
            if (!v) return
            // amount: chia theo chShare (channel span 2 tier); percent: theo revenue của row (đã đúng).
            opCost += v.type === "amount" ? (v.value || 0) * ratio * chShare : (rev * (v.value || 0)) / 100
          })
        })
      })
    }
    // group-level costs: web group_name = 'B2B' cho mọi B2B*, 'B2C' cho B2C.
    // BOD-1: chia group cost theo revenue-share (B2B-Strategic vs B2B-Non-Strategic); B2C/Other share=1.
    const tursoGroupName = groupName.startsWith("B2B") ? "B2B" : groupName
    const groupCostShare = tursoRevenueMap[tursoGroupName] > 0 ? revenue / tursoRevenueMap[tursoGroupName] : 0
    opCost += groupCosts.filter(c => c.group_name === tursoGroupName).reduce((s, c) => {
      const ratio = getDaysInMonth(c.month) > 0 ? getDaysInRange(startDate, endDate, c.month) / getDaysInMonth(c.month) : 0
      return s + c.amount * ratio
    }, 0) * groupCostShare

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

  // B2B per-customer cost (Turso b2b_customer_cost_monthly) — B2B KHÔNG dùng analytics_channel_costs
  // (tránh double-count, khớp Quarter Report/b2b-kpis). Phân bổ tổng cost B2B vào từng channel theo
  // revenue-share (không có dimension channel trong Turso cost).
  const custRevRows = await queryAnalytics<{ customer_code: string; month: string; revenue: string }>(
    `SELECT TRIM(f.customer_code) as customer_code, TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
            SUM(f.${source.revenueCol}) as revenue
     FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
     WHERE ${filter} ${extraFilters} AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
     GROUP BY 1, 2`
  )
  const custRevMap = new Map<string, number>()
  custRevRows.forEach(r => custRevMap.set(`${r.month}_${r.customer_code}`, parseFloat(r.revenue || "0")))
  const customerCostMap = await fetchCustomerCosts(months)
  let totalB2BTursoCost = 0
  customerCostMap.forEach((rec, key) => {
    const month = key.slice(0, 7), code = key.slice(8)
    const custRev = custRevMap.get(`${month}_${code}`) || 0
    if (custRev === 0) return
    const ratio = getDaysInMonth(month) > 0 ? getDaysInRange(startDate, endDate, month) / getDaysInMonth(month) : 0
    totalB2BTursoCost += calcChCostForPeriod(rec, custRev, ratio)
  })
  const totalB2BRevenue = Array.from(agg.values())
    .filter(r => (r.group || "").startsWith("B2B"))
    .reduce((s, r) => s + r.revenue, 0)

  return Array.from(agg.values()).map(row => {
    const isB2B = (row.group || "").startsWith("B2B")
    let opCost = 0
    if (isB2B) {
      opCost += totalB2BRevenue > 0 ? totalB2BTursoCost * (row.revenue / totalB2BRevenue) : 0
    }
    row.monthly.forEach((mRow: any) => {
      if (isB2B) return  // B2B dùng Turso cost ở trên, bỏ analytics_channel_costs tránh double-count
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

// Port intel fetchBODReportData: breakdown theo NGÀY, CM1 = dayMargin − op-cost rải đều theo ngày
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

  // B2B per-customer cost (Turso) theo NGÀY — B2B KHÔNG dùng analytics_channel_costs (tránh double-count).
  // Turso lưu theo tháng → amount-type rải đều/ngày (khớp cách group/channel cost đang rải), percent-type
  // dùng revenue KH đúng ngày đó.
  const custDailyRows = await queryAnalytics<{ date: string; customer_code: string; revenue: string }>(
    `SELECT TO_CHAR(fulfiled_date::date, 'YYYY-MM-DD') as date, TRIM(f.customer_code) as customer_code,
            SUM(f.fulfilled_revenue_amount_vnd) as revenue
     FROM fact_fulfillment_revenue f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
     WHERE ${filter} ${extraFilters} AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
     GROUP BY 1, 2`
  )
  const custDayRevMap = new Map<string, number>()
  custDailyRows.forEach(r => custDayRevMap.set(`${r.date}_${r.customer_code}`, parseFloat(r.revenue || "0")))
  const customerCostMap = await fetchCustomerCosts(months)
  const customerCostByMonth = new Map<string, Array<{ code: string; rec: import("@/lib/b2b-customer-cost").CostRecord }>>()
  customerCostMap.forEach((rec, key) => {
    const month = key.slice(0, 7), code = key.slice(8)
    if (!customerCostByMonth.has(month)) customerCostByMonth.set(month, [])
    customerCostByMonth.get(month)!.push({ code, rec })
  })

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
      const dcGroup = String(channelGroupMap.get(dc.channel) || "Other")
      if (dcGroup === "B2B") return  // B2B dùng Turso cost (dưới), bỏ analytics_channel_costs tránh double-count
      const dcRev = parseFloat(dc.revenue || "0")
      channelCosts.filter(c => c.channel === dc.channel && c.month === month).forEach(c => {
        COST_KEYS.forEach(key => {
          const v = (c as any)[key]
          if (v) dayOpCost += v.type === "amount" ? (v.value || 0) / monthDays : (dcRev * (v.value || 0)) / 100
        })
      })
    })
    // B2B per-customer cost (Turso), rải theo ngày
    ;(customerCostByMonth.get(month) || []).forEach(({ code, rec }) => {
      const dayCustRev = custDayRevMap.get(`${date}_${code}`) || 0
      if (dayCustRev === 0) return
      dayOpCost += calcChCostForPeriod(rec, dayCustRev, 1 / monthDays)
    })

    const dayGroups = Array.from(new Set(dayChannels.map(dc => getGroup(dc.channel, String(channelGroupMap.get(dc.channel) || "Other")))))
    // BOD-1: dayOpCost là TỔNG toàn nhóm → cộng group cost mỗi tursoGroupName ĐÚNG 1 lần (dedupe). Trước lặp
    // theo dayGroups nên B2B group cost bị cộng 2 lần khi cả B2B-Strategic + B2B-Non-Strategic cùng xuất hiện.
    const dayTursoGroups = Array.from(new Set(dayGroups.map(g => g.startsWith("B2B") ? "B2B" : g)))
    dayTursoGroups.forEach(tursoGroupName => {
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
