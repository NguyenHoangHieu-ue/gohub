import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter,
  getSkuDestinationRule, getDestinationSQL, getCountryMappings,
  getMonthsInRange, getChannelCostsForMonths, getCostSettingsForMonths,
  getGroupCostsForMonths, getDaysInRange, getDaysInMonth,
  shipFilter, internalOpsFilter, excludeOpsByCode,
  CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache,
} from "@/lib/analytics-helpers"
import { fetchQuarterlySettings } from "@/lib/quarterly-settings"
import { fetchCustomerCosts, type CostRecord, type CostLine } from "@/lib/b2b-customer-cost"

/**
 * Tính CH.Cost thực tế cho 1 tháng (pro-rata đúng cả 2 loại):
 * - percent: áp trên revenue thực kỳ (moRevenue đã lọc theo date range từ SQL)
 * - amount:  nhân dayRatio (= days_in_range_for_month / days_in_month)
 *
 * Khác calcRecordCostProjected: hàm đó dùng factor cho cả 2 loại (sai với cross-month range).
 * TODO (OOP refactor): chuyển hàm này vào class AnalyticsCostEngine dùng chung toàn hệ thống.
 */
function calcChCostForPeriod(rec: CostRecord, moRevenue: number, dayRatio: number): number {
  let lines: CostLine[] = []
  if (rec.cost_lines) {
    try { lines = typeof rec.cost_lines === "string" ? JSON.parse(rec.cost_lines) : (rec.cost_lines as unknown as CostLine[]) } catch {}
  }
  if (lines.length > 0) {
    return lines.reduce((tot, l) => {
      const val = Number(l?.value) || 0
      return tot + (l?.type === "percent" ? (val / 100) * moRevenue : val * dayRatio)
    }, 0)
  }
  const cval = Number(rec.cost_value) || 0
  return rec.cost_type === "percent" ? (cval / 100) * moRevenue : cval * dayRatio
}

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate  = searchParams.get("startDate") || ""
  const endDate    = searchParams.get("endDate")   || ""
  const dateColumn = searchParams.get("dateColumn") || "fulfiled_date"
  const groupBy    = searchParams.get("groupBy")    || "channel"
  const includeShip        = searchParams.get("includeShip")        === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"
  const includeOpsCustomers = searchParams.get("includeOpsCustomers") === "1"

  const source = getAnalyticsSource(dateColumn)
  const filter = getDateFilter(startDate || null, endDate || null, source.dateCol)

  try {
    const { excludedCustomers } = includeOpsCustomers ? { excludedCustomers: [] } : await fetchQuarterlySettings()
    const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)} ${excludeOpsByCode(excludedCustomers)}`
    // v3: thêm ch_cost, cm1, cm1_percent, cost_lines (s133 — customer CH.Cost từ Turso, pro-rata đúng)
    const key = `b2b-perf3:${dateColumn}:${startDate}:${endDate}:${groupBy}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}:${includeOpsCustomers ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
    let selectClause = "f.channel_name as name"
    let joinClause = ""
    if (groupBy === "vendor") {
      selectClause = "v.vendor as name"
      joinClause = "LEFT JOIN (SELECT DISTINCT ON (TRIM(sku)) * FROM dim_sku ORDER BY TRIM(sku)) v ON f.sku = v.sku"
    } else if (groupBy === "destination") {
      const rule = await getSkuDestinationRule()
      selectClause = `${getDestinationSQL(rule)} as name`
    } else if (groupBy === "sku") {
      selectClause = "f.sku as name"
    } else if (groupBy === "customer") {
      selectClause = "COALESCE(c.name, NULLIF(NULLIF(TRIM(f.customer_code), ''), 'NaN'), 'Chưa xác định') as name, TRIM(f.customer_code) as customer_code"
      joinClause = "LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code)"
    } else if (groupBy === "staff") {
      selectClause = "COALESCE(st.name, NULLIF(NULLIF(TRIM(f.staff_code), ''), 'NaN'), 'Chưa gán NV') as name"
      joinClause = "LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)"
    }

    const isChannelGroup = groupBy === "channel" || !groupBy
    const needsSubChannel = isChannelGroup || groupBy === "customer"

    const rows = await queryAnalytics<Record<string, string>>(
      `WITH b2b_raw AS (
         SELECT f.*, TRIM(s.channel_name) as channel_name, TRIM(s.sapo_name) as sub_channel,
                TRIM(COALESCE(s.sub_group_name, '')) as sub_group_name, TRIM(s.code) as source_code
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE UPPER(s.group_name) = 'B2B' AND ${filter} ${sfx}
       )
       SELECT ${selectClause},
              MAX(f.channel_name)    as channel,
              MAX(f.sub_group_name)  as sub_group_name,
              MAX(f.source_code)     as source_code,
              ${groupBy === "customer" ? "MAX(c.price_list_name) as price_list_name, MAX(c.currency_code) as currency_code," : ""}
              ${needsSubChannel ? "sub_channel," : "NULL as sub_channel,"}
              TO_CHAR(f.${source.dateCol}::DATE, 'YYYY-MM') as month,
              SUM(f.${source.revenueCol}) as revenue,
              SUM(f.${source.marginCol})  as margin,
              SUM(f.${source.quantityCol}) as units
       FROM b2b_raw f
       ${joinClause}
       GROUP BY ${
         groupBy === "customer"
           ? "COALESCE(c.name, NULLIF(NULLIF(TRIM(f.customer_code),''),'NaN'),'Chưa xác định'), TRIM(f.customer_code), sub_channel, TO_CHAR(f." + source.dateCol + "::DATE,'YYYY-MM')"
           : groupBy === "vendor"
           ? "v.vendor, sub_channel, TO_CHAR(f." + source.dateCol + "::DATE,'YYYY-MM')"
           : groupBy === "sku"
           ? "f.sku, sub_channel, TO_CHAR(f." + source.dateCol + "::DATE,'YYYY-MM')"
           : groupBy === "staff"
           ? "COALESCE(st.name, NULLIF(NULLIF(TRIM(f.staff_code),''),'NaN'),'Chưa gán NV'), sub_channel, TO_CHAR(f." + source.dateCol + "::DATE,'YYYY-MM')"
           : "f.channel_name, sub_channel, TO_CHAR(f." + source.dateCol + "::DATE,'YYYY-MM')"
       }`
    )

    // ── Aggregate in JS (name → totals + monthly + sub-channel breakdown) ───────
    type Item = {
      name: string; channel: string; sub_group_name: string; source_code: string
      customer_code?: string; price_list_name?: string; currency_code?: string
      revenue: number; margin: number; units: number
      monthly_data: Array<{ month: string; revenue: number; margin: number; units: number }>
      sub_channel_breakdown: Record<string, Record<string, { revenue: number; margin: number; units: number }>>
    }
    // For customer groupBy, key = customer_code (unique); otherwise key = name
    const aggregated = new Map<string, Item>()
    rows.forEach(r => {
      const key = groupBy === "customer" ? (r.customer_code || r.name) : r.name
      if (!aggregated.has(key)) {
        aggregated.set(key, {
          name: r.name, channel: r.channel,
          sub_group_name: r.sub_group_name || "",
          source_code: r.source_code || "",
          customer_code:   r.customer_code   || undefined,
          price_list_name: r.price_list_name || undefined,
          currency_code:   r.currency_code   || undefined,
          revenue: 0, margin: 0, units: 0, monthly_data: [], sub_channel_breakdown: {},
        })
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
    // 4 nguồn chi phí độc lập → chạy song song (customer cost chỉ load khi groupBy=customer)
    const [channelCosts, settingsMap, groupCostsRaw, customerCosts] = await Promise.all([
      getChannelCostsForMonths(months),
      getCostSettingsForMonths(months),
      getGroupCostsForMonths(months),
      groupBy === "customer" && months.length > 0
        ? fetchCustomerCosts(months)
        : Promise.resolve(new Map<string, CostRecord>()),
    ])
    // Group-level B2B costs — phân bổ theo tỷ lệ revenue từng channel
    const groupCosts = groupCostsRaw as Array<{ group_name: string; month: string; amount: string }>
    const b2bGroupCosts = groupCosts.filter(c => c.group_name === "B2B")
    const totalB2BRevenue = finalRows.reduce((s, r) => s + r.revenue, 0)
    // Mỗi channel nhận phần group cost tỷ lệ với revenue (revenue share * total group cost)
    const groupCostPerChannel: Record<string, number> = {}
    for (const r of finalRows) {
      const share = totalB2BRevenue > 0 ? r.revenue / totalB2BRevenue : 0
      for (const gc of b2bGroupCosts) {
        const ratio = getDaysInMonth(gc.month) > 0
          ? getDaysInRange(startDate || "", endDate || "", gc.month) / getDaysInMonth(gc.month) : 0
        groupCostPerChannel[r.name] = (groupCostPerChannel[r.name] || 0) + parseFloat(gc.amount || "0") * ratio * share
      }
    }

    // ── Index channelCosts một lần (O(M)) → tra cứu O(1) trong vòng lặp bên dưới,
    //    đưa opCost từ O(N×M) về O(N+M) (thay vì .filter quét cả mảng cho mỗi channel×tháng) ──
    type ChannelCost = typeof channelCosts[number]
    const costByChannelMonth = new Map<string, ChannelCost[]>()  // khớp chính xác: `${channel}_${month}`
    const subCostByBaseMonth = new Map<string, ChannelCost[]>()  // theo tiền tố: `${base}_${month}` cho kênh "Base - Sub"
    for (const c of channelCosts) {
      const exactKey = `${c.channel}_${c.month}`
      const ex = costByChannelMonth.get(exactKey); if (ex) ex.push(c); else costByChannelMonth.set(exactKey, [c])
      const sep = c.channel.indexOf(" - ")
      if (sep >= 0) {
        const subKey = `${c.channel.slice(0, sep)}_${c.month}`
        const sc = subCostByBaseMonth.get(subKey); if (sc) sc.push(c); else subCostByBaseMonth.set(subKey, [c])
      }
    }

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
          const subRatio = getDaysInMonth(mMonth) > 0
            ? getDaysInRange(startDate || "", endDate || "", mMonth) / getDaysInMonth(mMonth) : 0
          ;(subCostByBaseMonth.get(`${r.name}_${mMonth}`) ?? []).forEach(c => {
            const subName = c.channel.replace(`${r.name} - `, "")
            const subRev = r.sub_channel_breakdown[mMonth]?.[subName]?.revenue || 0
            COST_KEYS.forEach(key => {
              const cv = c[key]
              if (cv) {
                const amount = cv.type === "amount" ? (cv.value || 0) * subRatio : (subRev * (cv.value || 0)) / 100
                gpm2 -= amount
                if (subChannelPerformance[subName]) subChannelPerformance[subName].gpm2 -= amount
              }
            })
          })
        } else {
          (costByChannelMonth.get(`${r.name}_${mMonth}`) ?? []).forEach(c => {
            const ratio = getDaysInMonth(mMonth) > 0
              ? getDaysInRange(startDate || "", endDate || "", mMonth) / getDaysInMonth(mMonth) : 0
            COST_KEYS.forEach(key => {
              const cv = c[key]
              if (cv) gpm2 -= cv.type === "amount" ? (cv.value || 0) * ratio : (mRev * (cv.value || 0)) / 100
            })
          })
        }
      })

      // Cộng thêm phần group cost theo revenue share
      gpm2 -= (groupCostPerChannel[r.name] || 0)

      const sub_channels = Object.entries(subChannelPerformance).map(([name, m]) => ({
        name, revenue: m.revenue, margin: m.margin, units: m.units, gpm2: m.gpm2,
        margin_percent: m.revenue > 0 ? (m.margin / m.revenue) * 100 : 0,
        gpm2_percent: m.revenue > 0 ? (m.gpm2 / m.revenue) * 100 : 0,
      })).sort((a, b) => b.revenue - a.revenue)

      // ── Customer-level CH.Cost từ Turso (chỉ cho groupBy=customer) ─────────────
      // Pro-rata đúng: sum qua từng tháng × dayRatio (amount) hoặc × revenue thực (percent).
      let chCost = 0
      let costLinesDisplay: CostLine[] = []
      if (groupBy === "customer" && r.customer_code) {
        for (const mo of r.monthly_data) {
          const rec = customerCosts.get(`${mo.month}_${r.customer_code}`)
          if (!rec) continue
          const dayRatio = getDaysInMonth(mo.month) > 0
            ? getDaysInRange(startDate || "", endDate || "", mo.month) / getDaysInMonth(mo.month)
            : 0
          chCost += calcChCostForPeriod(rec, mo.revenue, dayRatio)
          // Gom cost_lines từ tất cả tháng để FE hiển thị breakdown
          if (rec.cost_lines) {
            try {
              const lines: CostLine[] = typeof rec.cost_lines === "string"
                ? JSON.parse(rec.cost_lines) : (rec.cost_lines as unknown as CostLine[])
              costLinesDisplay.push(...lines)
            } catch {}
          }
        }
      }
      const cm1 = gpm2 - chCost

      return {
        name: r.name, channel: r.channel,
        sub_group_name:  r.sub_group_name  || "",
        customer_code:   r.customer_code   || undefined,
        price_list_name: r.price_list_name || undefined,
        currency_code:   r.currency_code   || undefined,
        revenue, margin, units: r.units,
        margin_percent: revenue > 0 ? (margin / revenue) * 100 : 0,
        gpm2, gpm2_percent: revenue > 0 ? (gpm2 / revenue) * 100 : 0,
        ch_cost: chCost,
        cm1, cm1_percent: revenue > 0 ? (cm1 / revenue) * 100 : 0,
        cost_lines: costLinesDisplay,  // cho FE hiển thị breakdown trong expand panel
        sub_channels,
      }
    })

    return result
    }, QUERY_TTL_MIN, noCache(req))

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/b2b/performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
