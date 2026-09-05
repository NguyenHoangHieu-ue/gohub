import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import {
  getAnalyticsSource, getDateFilter, getPrevDateFilter, shipFilter, internalOpsFilter,
  getMonthsInRange, getChannelCostsForMonths, getGroupCostsForMonths, getDaysInRange, getDaysInMonth,
  CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, analyticsGuard,
} from "@/lib/analytics-helpers"
import { getProjectionFactor } from "@/lib/analytics-engine/projection"
import { COST_KEYS, calcChCostForPeriod } from "@/lib/analytics-engine/cost-engine"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session); if (guard) return guard

  const { searchParams } = req.nextUrl
  const startDate   = searchParams.get("startDate")
  const endDate     = searchParams.get("endDate")
  const dateColumn  = searchParams.get("dateColumn")  || "fulfiled_date"
  const channelName = searchParams.get("channel")     || ""
  const channelGroup = searchParams.get("channelGroup") || ""
  const includeShip        = searchParams.get("includeShip")        === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"

  const source     = getAnalyticsSource(dateColumn)
  const filter     = getDateFilter(startDate, endDate, source.dateCol)
  const prevFilter = getPrevDateFilter(startDate, endDate, "none", source.dateCol)
  const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)}`

  const chFilter = channelName
    ? `AND TRIM(s.channel_name) = '${channelName.replace(/'/g, "''")}'`
    : channelGroup && channelGroup !== "All"
      ? `AND UPPER(s.group_name) = '${channelGroup.toUpperCase().replace(/'/g, "''")}'`
      : ""

  try {
    const key = `ch-kpis:${dateColumn}:${startDate}:${endDate}:${channelName}:${channelGroup}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
    // Xác định scope hiện tại có phải B2B không — để dùng Turso per-customer cost thay analytics_channel_costs
    // (tránh double-count, khớp Quarter Report/b2b-kpis).
    let isB2BScope = channelGroup === "B2B"
    if (!isB2BScope && channelName) {
      const chGroupRows = await queryAnalytics<{ group_name: string }>(
        `SELECT DISTINCT UPPER(group_name) as group_name FROM dim_order_source WHERE TRIM(channel_name) = '${channelName.replace(/'/g, "''")}' LIMIT 1`
      )
      isB2BScope = chGroupRows[0]?.group_name === "B2B"
    }
    const [cur, prv] = await Promise.all([
      queryAnalytics<Record<string, string>>(
        `SELECT SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                COUNT(DISTINCT f.order_code) as orders,
                SUM(f.${source.quantityCol}) as units
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${filter} ${chFilter} ${sfx}`
      ),
      queryAnalytics<Record<string, string>>(
        `SELECT SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                COUNT(DISTINCT f.order_code) as orders
         FROM ${source.mainTable} f
         LEFT JOIN dim_order_source s ON f.order_source_code = s.code
         WHERE ${prevFilter} ${chFilter} ${sfx}`
      ),
    ])

    const c   = cur[0] || {}
    const p   = prv[0] || {}
    const cRev = parseFloat(c.revenue || "0")
    const pRev = parseFloat(p.revenue || "0")
    const cMar = parseFloat(c.margin  || "0")
    const pMar = parseFloat(p.margin  || "0")
    const cOrd = parseInt(c.orders    || "0")
    const pOrd = parseInt(p.orders    || "0")
    const cUni = parseInt(c.units     || "0")
    const pct  = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100

    // ── CM1 = margin − channel op costs (pro-rata đúng từng tháng) ──────────────
    // Load costs cho tất cả months trong range (xử lý đúng cross-month).
    // Group costs: revShare=1 khi query theo group, channel costs theo channelName.
    const months = getMonthsInRange(startDate || "", endDate || "")
    let cm1 = cMar
    if (months.length > 0) {
      const [channelCosts, groupCostsRaw] = await Promise.all([
        getChannelCostsForMonths(months),
        getGroupCostsForMonths(months),
      ])
      const groupCosts = groupCostsRaw as Array<{ group_name: string; month: string; amount: string }>
      let opCost = 0

      if (isB2BScope) {
        // B2B: Turso per-customer cost thay analytics_channel_costs (tránh double-count).
        const [custRevRows, customerCostMap] = await Promise.all([
          queryAnalytics<{ customer_code: string; month: string; revenue: string }>(
            `SELECT TRIM(f.customer_code) as customer_code, TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
                    SUM(f.${source.revenueCol}) as revenue
             FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
             WHERE ${filter} ${chFilter} ${sfx}
             GROUP BY 1, 2`
          ),
          fetchCustomerCosts(months),
        ])
        const custRevMap = new Map<string, number>()
        custRevRows.forEach(r => custRevMap.set(`${r.month}_${r.customer_code}`, parseFloat(r.revenue || "0")))
        customerCostMap.forEach((rec, ckey) => {
          const mo = ckey.slice(0, 7); const code = ckey.slice(8)
          const custRev = custRevMap.get(`${mo}_${code}`) || 0
          if (custRev === 0) return
          const dayRatio = getDaysInMonth(mo) > 0 ? getDaysInRange(startDate || "", endDate || "", mo) / getDaysInMonth(mo) : 0
          opCost += calcChCostForPeriod(rec, custRev, dayRatio)
        })
      } else {
        // Channel-level costs (theo channelName hoặc tất cả channels nếu không filter)
        const relevantChannelCosts = channelName
          ? channelCosts.filter(cc => cc.channel === channelName)
          : channelCosts  // all channels (group aggregate)

        relevantChannelCosts.forEach(cc => {
          const dayRatio = getDaysInMonth(cc.month) > 0
            ? getDaysInRange(startDate || "", endDate || "", cc.month) / getDaysInMonth(cc.month) : 0
          COST_KEYS.forEach(key => {
            const cv = cc[key]
            // percent type: dùng cRev (tổng revenue kỳ) — xấp xỉ đủ cho KPI card
            if (cv?.value) opCost += cv.type === "amount" ? cv.value * dayRatio : (cRev * cv.value) / 100
          })
        })
      }

      // Group-level costs (B2B / B2C) — revShare=1 khi query toàn group
      const tursoGroup = channelGroup === "B2B" ? "B2B" : channelGroup === "B2C" ? "B2C" : null
      if (tursoGroup) {
        groupCosts.filter(gc => gc.group_name === tursoGroup).forEach(gc => {
          const dayRatio = getDaysInMonth(gc.month) > 0
            ? getDaysInRange(startDate || "", endDate || "", gc.month) / getDaysInMonth(gc.month) : 0
          opCost += parseFloat(gc.amount || "0") * dayRatio
        })
      }

      cm1 = cMar - opCost
    }

    const projFactor = getProjectionFactor(startDate || "", endDate || "")

    return {
      revenue:        cRev,
      margin:         cMar,
      margin_percent: cRev > 0 ? (cMar / cRev) * 100 : 0,
      gpm2:           cm1,
      gpm2_percent:   cRev > 0 ? (cm1 / cRev) * 100 : 0,
      cm1,
      cm1_percent:    cRev > 0 ? (cm1 / cRev) * 100 : 0,
      projection_factor: projFactor,
      orders:         cOrd,
      units:          cUni,
      prev_revenue:   pRev,
      prev_margin:    pMar,
      prev_orders:    pOrd,
      revenue_change: pct(cRev, pRev),
      margin_change:  pct(cMar, pMar),
      orders_change:  pct(cOrd, pOrd),
    }
    }, QUERY_TTL_MIN, undefined, ["b2b-cost"])

    return NextResponse.json(payload, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[analytics/channels/kpis]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
