import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { fetchQuarterlySettings, makeExcludeSql, exclHash } from "@/lib/quarterly-settings"
import { getAnalyticsSource, getBODFilters, getDateFilter, getPrevDateFilter, shipFilter, internalOpsFilter, excludeInactiveCustomers, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard, noCache } from "@/lib/analytics-helpers"
import { fetchCosts, monthsBetween } from "@/lib/bod-data"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"
import { allocateCustomerCostByKey } from "@/lib/analytics-engine/customer-cost-allocation"
import { COST_KEYS, rangeDayRatio } from "@/lib/analytics-engine/cost-engine"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate    = searchParams.get("startDate")
  const endDate      = searchParams.get("endDate")
  const dateColumn   = searchParams.get("dateColumn")   || "fulfiled_date"
  const channelGroup = searchParams.get("channelGroup") || "All"

  // Vendors / Product Type (cùng chuẩn BOD) — trước đây route bỏ qua, bộ lọc ở trang không có tác dụng ở chế độ Overview (QA Ch-03).
  const extraFilters = getBODFilters(searchParams)
  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter = getPrevDateFilter(startDate, endDate, "none", source.dateCol)
  const groupFilter = channelGroup !== "All"
    ? `AND UPPER(s.group_name) = '${channelGroup.toUpperCase()}'`
    : ""
  // Trang Channels không có toggle Phí ship/Đơn nội bộ riêng (khác BOD/B2B/B2C) — luôn loại mặc định,
  // khớp channels/kpis (CM1 card cùng trang) — s197 audit toàn hệ thống logic dữ liệu.
  const { excludedCustomers } = await fetchQuarterlySettings()
  const sfx = `${shipFilter(false)} ${internalOpsFilter(false)} ${excludeInactiveCustomers()} ${makeExcludeSql(excludedCustomers)}`

  try {
    const key = `ch-perf6:${dateColumn}:${startDate}:${endDate}:${channelGroup}:${extraFilters}:${exclHash(excludedCustomers)}`
    const payload = await cachedQuery(key, async () => {
    const rows = await queryAnalytics<Record<string, string>>(
      `WITH cur AS (
         SELECT TRIM(s.channel_name) as channel,
                UPPER(s.group_name) as group_name,
                SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                SUM(f.${source.quantityCol}) as units,
                COUNT(DISTINCT f.order_code) as orders
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${filter} ${groupFilter} ${extraFilters} ${sfx}
         GROUP BY TRIM(s.channel_name), UPPER(s.group_name)
       ),
       prv AS (
         SELECT TRIM(s.channel_name) as channel,
                SUM(f.${source.revenueCol}) as revenue
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${prevFilter} ${groupFilter} ${extraFilters} ${sfx}
         GROUP BY TRIM(s.channel_name)
       )
       SELECT c.channel, c.group_name,
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
    // (tránh double-count với Turso, khớp Quarter Report/b2b-kpis). Chi phí tính theo KHÁCH THẬT rồi chia về từng
    // channel theo doanh thu của khách trong channel (s232) — trước gộp mọi chi phí B2B rồi chia theo doanh thu channel
    // nên channel có khách chưa nhập chi phí vẫn bị trừ.
    let b2bCostByChannel = new Map<string, number>()
    if (groupRevTotals["B2B"] > 0) {
      const [custRevRows, customerCostMap] = await Promise.all([
        queryAnalytics<{ customer_code: string; month: string; channel: string; revenue: string }>(`
          SELECT TRIM(f.customer_code) as customer_code, TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
                 TRIM(s.channel_name) as channel, SUM(f.${source.revenueCol}) as revenue
          FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE ${filter} ${extraFilters} ${sfx} AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
          GROUP BY 1, 2, 3
        `),
        fetchCustomerCosts(months),
      ])
      b2bCostByChannel = allocateCustomerCostByKey(
        custRevRows.map(r => ({ customer_code: r.customer_code, month: r.month, key: r.channel, revenue: parseFloat(r.revenue || "0") })),
        customerCostMap, startDate || "", endDate || "",
      )
    }

    return rows.map(r => {
      const rev  = parseFloat(r.revenue      || "0")
      const mar  = parseFloat(r.margin       || "0")
      const prv  = parseFloat(r.prev_revenue || "0")
      const grp  = r.group_name || ""

      const isB2B = grp.startsWith("B2B")
      // Op cost theo channel (channel_costs: ads/platform/sponsor/media) — B2B KHÔNG dùng nguồn này
      // (dùng Turso per-customer cost thay thế, xem b2bCostByChannel ở trên).
      let opCost = 0
      if (!isB2B) {
        channelCosts.filter(cc => cc.channel === r.channel).forEach(cc => {
          const ratio = rangeDayRatio(startDate || "", endDate || "", cc.month)
          COST_KEYS.forEach(key => {
            const v = (cc as any)[key]
            if (v) opCost += v.type === "amount" ? (v.value || 0) * ratio : (rev * (v.value || 0)) / 100
          })
        })
      }
      // Op cost theo group (channel_group_costs: B2B / B2C) — chia theo revenue share
      const tursoGroup = grp.startsWith("B2B") ? "B2B" : grp.includes("B2C") ? "B2C" : grp
      const revShare = (groupRevTotals[tursoGroup] || 0) > 0 ? rev / groupRevTotals[tursoGroup] : 0
      if (isB2B) opCost += b2bCostByChannel.get(r.channel) || 0
      groupCosts.filter(gc => gc.group_name === tursoGroup).forEach(gc => {
        const ratio = rangeDayRatio(startDate || "", endDate || "", gc.month)
        opCost += gc.amount * ratio * revShare
      })

      const gpm2 = mar - opCost
      return {
        channel:        r.channel,
        group_name:     grp,
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
    }, QUERY_TTL_MIN, noCache(req), ["b2b-cost"])

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/channels/performance]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
