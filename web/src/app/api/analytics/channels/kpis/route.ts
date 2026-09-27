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
    const key = `ch-kpis2:${dateColumn}:${startDate}:${endDate}:${channelName}:${channelGroup}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}`
    const payload = await cachedQuery(key, async () => {
    const [cur, prv] = await Promise.all([
      queryAnalytics<Record<string, string>>(
        `SELECT SUM(f.${source.revenueCol}) as revenue,
                SUM(f.${source.marginCol})  as margin,
                COUNT(DISTINCT f.order_code) as orders,
                SUM(f.${source.quantityCol}) as units,
                SUM(CASE WHEN UPPER(COALESCE(s.group_name,'')) = 'B2B' THEN f.${source.revenueCol} ELSE 0 END) as b2b_revenue,
                SUM(CASE WHEN UPPER(COALESCE(s.group_name,'')) = 'B2C' THEN f.${source.revenueCol} ELSE 0 END) as b2c_revenue
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
    const cB2BRev = parseFloat(c.b2b_revenue || "0")
    const cB2CRev = parseFloat(c.b2c_revenue || "0")
    const pct  = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100

    // ── CM1 = margin − op cost, CÙNG công thức Quarter Report (s211d) ───────────────────────────────
    // Trước: chỉ 1 trong 2 (Turso B2B HOẶC channel-cost B2C) tuỳ "isB2BScope" suy từ filter đang chọn, và
    // group cost CHỈ áp khi channelGroup param đúng "B2B"/"B2C" — trang Channels (channelGroup="All" mặc
    // định, hoặc gọi kpis chỉ truyền `channel`) không bao giờ trừ Turso B2B lẫn group cost → CM1 cao hơn
    // thật rất nhiều (đo T8: 3,09 tỷ vs 2,17 tỷ đúng). Nay LUÔN cộng cả 2 nguồn theo đúng phần B2B/B2C thật
    // của scope đang xem + group cost phân bổ theo tỷ trọng doanh thu scope/toàn công ty (khớp bod-data.ts).
    const months = getMonthsInRange(startDate || "", endDate || "")
    let cm1 = cMar
    if (months.length > 0) {
      const [channelCosts, groupCostsRaw, custRevRows, customerCostMap, companyGroupRows] = await Promise.all([
        getChannelCostsForMonths(months),
        getGroupCostsForMonths(months),
        cB2BRev !== 0
          ? queryAnalytics<{ customer_code: string; month: string; revenue: string }>(
              // KHÔNG lọc theo chFilter — Turso cost gắn với KHÁCH HÀNG, không có dimension channel (1 khách
              // có thể mua qua nhiều kênh trong kỳ). Cần tổng doanh thu TOÀN CÔNG TY của khách để tính đúng
              // % phí, sau đó phân bổ TỔNG chi phí B2B vào scope theo tỷ trọng doanh thu (giống channels/
              // performance + bod-data.ts `finalizeGroupMargin` — KHÔNG tính trực tiếp theo doanh thu trong
              // phạm vi kênh, sẽ sai khi 1 khách trải nhiều kênh).
              `SELECT TRIM(f.customer_code) as customer_code, TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
                      SUM(f.${source.revenueCol}) as revenue
               FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
               WHERE ${filter} ${sfx} AND UPPER(COALESCE(s.group_name,'')) = 'B2B'
               GROUP BY 1, 2`
            )
          : Promise.resolve([] as { customer_code: string; month: string; revenue: string }[]),
        cB2BRev !== 0 ? fetchCustomerCosts(months) : Promise.resolve(new Map<string, import("@/lib/b2b-customer-cost").CostRecord>()),
        // Doanh thu B2B/B2C TOÀN CÔNG TY cùng kỳ (không lọc channel) — mẫu số revenue-share phân bổ group cost.
        queryAnalytics<{ grp: string; rev: string }>(
          `SELECT UPPER(COALESCE(s.group_name,'OTHER')) as grp, SUM(f.${source.revenueCol}) as rev
           FROM ${source.mainTable} f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
           WHERE ${filter} ${sfx} GROUP BY 1`
        ),
      ])
      const groupCosts = groupCostsRaw as Array<{ group_name: string; month: string; amount: string }>
      let opCost = 0

      // B2B: TỔNG chi phí Turso toàn công ty, rồi phân bổ vào scope theo revShare (cùng cách group cost bên dưới).
      const custRevMap = new Map<string, number>()
      custRevRows.forEach(r => custRevMap.set(`${r.month}_${r.customer_code}`, parseFloat(r.revenue || "0")))
      let totalB2BTursoCost = 0
      customerCostMap.forEach((rec, ckey) => {
        const mo = ckey.slice(0, 7); const code = ckey.slice(8)
        const custRev = custRevMap.get(`${mo}_${code}`) || 0
        if (custRev === 0) return
        const dayRatio = getDaysInMonth(mo) > 0 ? getDaysInRange(startDate || "", endDate || "", mo) / getDaysInMonth(mo) : 0
        totalB2BTursoCost += calcChCostForPeriod(rec, custRev, dayRatio)
      })

      // B2C: channel-level costs (theo channelName hoặc tất cả channels nếu không filter).
      const relevantChannelCosts = channelName
        ? channelCosts.filter(cc => cc.channel === channelName)
        : channelCosts  // all channels (group aggregate)
      relevantChannelCosts.forEach(cc => {
        const dayRatio = getDaysInMonth(cc.month) > 0
          ? getDaysInRange(startDate || "", endDate || "", cc.month) / getDaysInMonth(cc.month) : 0
        COST_KEYS.forEach(key => {
          const cv = cc[key]
          // percent type: dùng cB2CRev (doanh thu B2C thực trong scope) — B2B đã tính riêng ở trên.
          if (cv?.value) opCost += cv.type === "amount" ? cv.value * dayRatio : (cB2CRev * cv.value) / 100
        })
      })

      // Group-level costs (B2B / B2C) — phân bổ theo tỷ trọng doanh thu scope/toàn công ty cùng kỳ
      // (revShare=1 khi scope = toàn công ty, đúng công thức bod-data.ts `finalizeGroupMargin`).
      const companyRevByGroup: Record<string, number> = {}
      for (const r of companyGroupRows) companyRevByGroup[r.grp] = parseFloat(r.rev || "0")
      const revShareOf = (scopeRev: number, grp: "B2B" | "B2C") =>
        (companyRevByGroup[grp] || 0) > 0 ? scopeRev / companyRevByGroup[grp] : 0
      opCost += totalB2BTursoCost * revShareOf(cB2BRev, "B2B")
      groupCosts.forEach(gc => {
        const share = gc.group_name === "B2B" ? revShareOf(cB2BRev, "B2B") : gc.group_name === "B2C" ? revShareOf(cB2CRev, "B2C") : 0
        if (share === 0) return
        const dayRatio = getDaysInMonth(gc.month) > 0
          ? getDaysInRange(startDate || "", endDate || "", gc.month) / getDaysInMonth(gc.month) : 0
        opCost += parseFloat(gc.amount || "0") * dayRatio * share
      })

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
