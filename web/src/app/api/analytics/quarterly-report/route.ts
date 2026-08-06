import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, noCache, shipFilter, internalOpsFilter } from "@/lib/analytics-helpers"
import { fetchCosts, getDaysInMonth, getDaysInRange, matchChannelCost } from "@/lib/bod-data"
import { fetchQuarterlySettings, makeExcludeSql, exclHash } from "@/lib/quarterly-settings"
import { fetchCustomerCosts, type CostRecord } from "@/lib/b2b-customer-cost"
import { buildQuarterMonthMeta } from "@/lib/analytics-engine/quarter-projection"

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Chạy các thunk với GIỚI HẠN ĐỒNG THỜI (limit) — tránh mở quá nhiều kết nối gohub_dw cùng lúc
// (DB hay cạn slot "remaining connection slots reserved for superuser"). Giữ đúng thứ tự + tuple type.
async function runLimited<T extends readonly (() => Promise<unknown>)[]>(
  limit: number, thunks: [...T],
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results = new Array(thunks.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= thunks.length) return
      results[i] = await thunks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker))
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }
}

function getQuarterMonths(quarter: string, year: number): string[] {
  const q = parseInt(quarter.replace("Q", ""))
  const start = (q - 1) * 3 + 1
  return [0, 1, 2].map(i => {
    const m = start + i
    return `${year}-${String(m).padStart(2, "0")}`
  })
}

function computeChannelCost(
  channelCosts: any[], channel: string, month: string,
  revenue: number, startD: string, endD: string,
  sourceCode?: string,
): number {
  let amtCost = 0, pctCost = 0
  const dim = getDaysInMonth(month)
  const ratio = dim > 0 ? getDaysInRange(startD, endD, month) / dim : 0
  matchChannelCost(channelCosts, channel, month, sourceCode).forEach(c => {
    COST_KEYS.forEach(key => {
      const v = (c as any)[key]
      if (!v) return
      if (v.type === "amount") amtCost += (v.value || 0) * ratio
      else pctCost += revenue * (v.value || 0) / 100
    })
  })
  return amtCost + pctCost
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const { searchParams } = req.nextUrl
  const today = new Date()
  const year = parseInt(searchParams.get("year") || String(today.getFullYear()))
  const quarter = searchParams.get("quarter") || `Q${Math.ceil((today.getMonth() + 1) / 3)}`
  const companyCode = searchParams.get("companyCode") || "ALL"
  const includeShip = searchParams.get("includeShip") === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"

  const DATE_COL = "fulfiled_date"
  const MAIN_TABLE = "fact_fulfillment_revenue"
  const REV_COL = "fulfilled_revenue_amount_vnd"
  const GP_COL = "gross_profit_vnd"

  const months = getQuarterMonths(quarter, year)
  const asOf = new Date(today)
  asOf.setDate(asOf.getDate() - 1)
  const todayStr = asOf.toISOString().split("T")[0]

  const qStartDate = `${months[0]}-01`
  const lastMonth = months[2]
  const lastMonthEndDate = new Date(parseInt(lastMonth.split("-")[0]), parseInt(lastMonth.split("-")[1]), 0)
  const qEndDate = lastMonthEndDate < asOf ? lastMonthEndDate.toISOString().split("T")[0] : todayStr

  if (new Date(qStartDate) > today) {
    return NextResponse.json({ quarter, year, months, summary: [], b2bChannels: [], b2cChannels: [], elapsed_days: 0, quarter_days: 0 }, { headers: CACHE_HEADERS })
  }

  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""
  const refresh = noCache(req)

  const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)}`
  const { excludedCustomers } = await fetchQuarterlySettings()
  const EXCLUDE_CUST_SQL = makeExcludeSql(excludedCustomers)

  // Previous quarter dates
  const qNum = parseInt(quarter.replace("Q", ""))
  const prevQNum = qNum === 1 ? 4 : qNum - 1
  const prevQYear = qNum === 1 ? year - 1 : year
  const prevQFirst = (prevQNum - 1) * 3 + 1
  const prevQStartDate = `${prevQYear}-${String(prevQFirst).padStart(2, "0")}-01`
  const prevQEndDate = new Date(prevQYear, prevQNum * 3, 0).toISOString().split("T")[0]
  const prevQMonths = [0, 1, 2].map(i => `${prevQYear}-${String(prevQFirst + i).padStart(2, "0")}`)

  const rawCacheKey = `qreport_raw_v9:${quarter}:${year}:${companyCode}:${todayStr}:${exclHash(excludedCustomers)}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}`

  // CTE TỐI ƯU: Dùng JOIN thay NOT IN subquery — query planner hiệu quả hơn với dữ liệu lớn.
  // inactive_cust: LEFT JOIN + IS NULL thay NOT IN. hk3_skus: JOIN trực tiếp.
  const CTE_PREAMBLE = `
    WITH inactive_cust AS (
      SELECT TRIM(code) as code FROM dim_customer WHERE UPPER(COALESCE(price_list_name, '')) LIKE '%INACTIVE%'
    ),
    hk3_skus AS (
      SELECT DISTINCT TRIM(sku) as sku FROM dim_sku WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
    )
  `
  // Filter SQL dùng NOT EXISTS thay NOT IN (tránh NULL-trap, nhanh hơn với list lớn)
  const INACTIVE_FILTER = `AND NOT EXISTS (SELECT 1 FROM inactive_cust ic WHERE ic.code = TRIM(f.customer_code))`

  try {
    const [rawData, { channelCosts, groupCosts }, { channelCosts: prevChannelCosts, groupCosts: prevGroupCosts }, customerCostMap, prevCustomerCostMap] = await Promise.all([
      cachedQuery(rawCacheKey, async () => {
        // GIỚI HẠN 2 query đồng thời (thay vì cả 5) → giảm connection footprint trên gohub_dw.
        // Mỗi query ~2s → 5 query / 2 luồng ≈ 6s, vẫn nhanh nhưng nhẹ với DB (tránh cạn slot).
        const [groupRows, channelRows, hk3Rows, prevGroupRows, prevChannelRows, custRevRows] = await runLimited(2, [
          () => queryAnalytics<{ month: string; bg: string; revenue: string; gp: string }>(`
          ${CTE_PREAMBLE}
          SELECT
            LEFT(f.${DATE_COL}, 7) as month,
            UPPER(COALESCE(s.group_name, 'OTHER')) as bg,
            SUM(f.${REV_COL}) as revenue,
            SUM(f.${GP_COL}) as gp
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE f.${DATE_COL} >= '${qStartDate}' AND f.${DATE_COL} <= '${qEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')
            ${INACTIVE_FILTER}
            ${EXCLUDE_CUST_SQL}
            ${sfx}
          GROUP BY 1, 2
          ORDER BY 1, 2
        `),
          () => queryAnalytics<{ month: string; bg: string; channel: string; source_code: string; revenue: string; gp: string; hk3: string }>(`
          ${CTE_PREAMBLE}
          SELECT
            LEFT(f.${DATE_COL}, 7) as month,
            UPPER(COALESCE(s.group_name, 'OTHER')) as bg,
            TRIM(s.channel_name) as channel,
            MIN(TRIM(s.code)) as source_code,
            SUM(f.${REV_COL}) as revenue,
            SUM(f.${GP_COL}) as gp,
            SUM(CASE WHEN hk.sku IS NOT NULL THEN f.${REV_COL} ELSE 0 END) as hk3
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN hk3_skus hk ON hk.sku = TRIM(f.sku)
          WHERE f.${DATE_COL} >= '${qStartDate}' AND f.${DATE_COL} <= '${qEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')
            AND s.channel_name IS NOT NULL AND TRIM(s.channel_name) != ''
            ${INACTIVE_FILTER}
            ${EXCLUDE_CUST_SQL}
            ${sfx}
          GROUP BY 1, 2, 3
          ORDER BY 1, 2, 3
        `),
          () => queryAnalytics<{ month: string; hk3: string }>(`
          ${CTE_PREAMBLE}
          SELECT
            LEFT(f.${DATE_COL}, 7) as month,
            SUM(CASE WHEN hk.sku IS NOT NULL THEN f.${REV_COL} ELSE 0 END) as hk3
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN hk3_skus hk ON hk.sku = TRIM(f.sku)
          WHERE f.${DATE_COL} >= '${qStartDate}' AND f.${DATE_COL} <= '${qEndDate}'
            ${companyFilter}
            ${INACTIVE_FILTER}
            ${EXCLUDE_CUST_SQL}
            ${sfx}
          GROUP BY 1
        `),
          () => queryAnalytics<{ bg: string; revenue: string; gp: string }>(`
          ${CTE_PREAMBLE}
          SELECT UPPER(COALESCE(s.group_name,'OTHER')) as bg,
            SUM(f.${REV_COL}) as revenue, SUM(f.${GP_COL}) as gp
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE f.${DATE_COL} >= '${prevQStartDate}' AND f.${DATE_COL} <= '${prevQEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name,'OTHER')) IN ('B2B','B2C')
            ${INACTIVE_FILTER}
            ${EXCLUDE_CUST_SQL}
            ${sfx}
          GROUP BY 1
        `),
          () => queryAnalytics<{ month: string; bg: string; channel: string; revenue: string; gp: string }>(`
          ${CTE_PREAMBLE}
          SELECT
            LEFT(f.${DATE_COL}, 7) as month,
            UPPER(COALESCE(s.group_name, 'OTHER')) as bg,
            TRIM(s.channel_name) as channel,
            SUM(f.${REV_COL}) as revenue,
            SUM(f.${GP_COL}) as gp
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE f.${DATE_COL} >= '${prevQStartDate}' AND f.${DATE_COL} <= '${prevQEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')
            AND s.channel_name IS NOT NULL AND TRIM(s.channel_name) != ''
            ${INACTIVE_FILTER}
            ${EXCLUDE_CUST_SQL}
            ${sfx}
          GROUP BY 1, 2, 3
        `),
          // Revenue B2B theo KH×tháng — để áp chi phí per-customer (Turso) đúng: percent×revenue KH đó.
          () => queryAnalytics<{ month: string; customer_code: string; revenue: string }>(`
          ${CTE_PREAMBLE}
          SELECT
            LEFT(f.${DATE_COL}, 7) as month,
            TRIM(f.customer_code) as customer_code,
            SUM(f.${REV_COL}) as revenue
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          WHERE f.${DATE_COL} >= '${qStartDate}' AND f.${DATE_COL} <= '${qEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B'
            ${INACTIVE_FILTER}
            ${EXCLUDE_CUST_SQL}
            ${sfx}
          GROUP BY 1, 2
        `),
        ])

        return { groupRows, channelRows, hk3Rows, prevGroupRows, prevChannelRows, custRevRows }
      }, QUERY_TTL_MIN, refresh),
      fetchCosts(months),
      fetchCosts(prevQMonths),
      fetchCustomerCosts(months).catch(() => new Map<string, CostRecord>()),      // Turso B2B customer costs current Q
      fetchCustomerCosts(prevQMonths).catch(() => new Map<string, CostRecord>()), // Turso B2B customer costs prev Q (QoQ)
    ])

    const { groupRows, channelRows, hk3Rows, prevGroupRows, prevChannelRows, custRevRows } = rawData

    // Index revenue B2B theo `${month}_${code}` để áp chi phí per-customer đúng (percent × revenue KH đó).
    const custRevMap = new Map<string, number>()
    ;(custRevRows as Array<{ month: string; customer_code: string; revenue: string }>).forEach(r => {
      custRevMap.set(`${r.month}_${r.customer_code}`, parseFloat(r.revenue || "0"))
    })
    // Tổng chi phí B2B per-customer (Turso) theo tháng — amount pro-rata ngày, percent × revenue KH.
    // Chỉ tính chi phí cho customer CÓ ORDERS trong tháng đó (custRev > 0).
    // Lý do: nếu customer có Turso cost entry nhưng không có đơn hàng trong tháng, quarterly-b2b-customers
    // KHÔNG đưa họ vào customerMap (chỉ query từ fact orders) → cost đó không xuất hiện trong Bảng 3.
    // Để đồng nhất: bỏ amount cost của customer không có orders trong tháng đó.
    const b2bCustCostByMonth = (month: string, dayRatio: number): number => {
      let tot = 0
      customerCostMap.forEach((rec, key) => {
        const [cm, code] = [key.slice(0, 7), key.slice(8)]
        if (cm !== month) return
        const custRev = custRevMap.get(`${month}_${code}`) || 0
        if (custRev === 0) return  // skip KH không có orders tháng này → nhất quán với Bảng 3
        let lines: Array<{ type: string; value: number }> = []
        if (rec.cost_lines) { try { lines = JSON.parse(rec.cost_lines) } catch {} }
        if (lines.length > 0) {
          lines.forEach(l => { const v = Number(l?.value) || 0; tot += l?.type === "percent" ? (v / 100) * custRev : v * dayRatio })
        } else {
          const v = Number(rec.cost_value) || 0
          tot += rec.cost_type === "percent" ? (v / 100) * custRev : v * dayRatio
        }
      })
      return tot
    }

    const monthMeta = buildQuarterMonthMeta(months, asOf, todayStr)

    const pct = (num: number, den: number) => den > 0 ? Math.round(num / den * 1000) / 10 : 0
    const r = Math.round

    const summary = monthMeta.filter(mr => !mr.isFuture).map(mr => {
      const { month, mStart, actualEnd, isProjected, factor, elapsed, dim } = mr

      const b2bR = groupRows.find(row => row.month === month && row.bg === "B2B")
      const b2cR = groupRows.find(row => row.month === month && row.bg === "B2C")

      const b2bRevAct = parseFloat(b2bR?.revenue || "0")
      const b2bGpAct = parseFloat(b2bR?.gp || "0")
      const b2cRevAct = parseFloat(b2cR?.revenue || "0")
      const b2cGpAct = parseFloat(b2cR?.gp || "0")

      // isCurrent: tháng chưa kết thúc (elapsed < dim). Khác isProjected — isProjected thêm điều kiện
      // elapsed >= MIN_PROJECT_DAYS để tránh factor quá lớn. isCurrent dùng cho pro-rate group/customer cost.
      const isCurrent = elapsed < dim
      // gcElapsedRatio: pro-rate cho MỌI tháng hiện tại (không chỉ tháng đang chiếu).
      // Sửa bug: khi T8 ngày 4 < MIN_PROJECT_DAYS=7, isProjected=false → ratio cũ=1 → Group Cost = full 150Tr
      // áp cho chỉ 4 ngày data → CM1 B2C âm -33tr. Fix: dùng isCurrent thay isProjected.
      const gcElapsedRatio = isCurrent && dim > 0 ? elapsed / dim : 1

      let b2bCCAct = 0, b2cCCAct = 0
      let b2bHk3Act = 0, b2cHk3Act = 0
      channelRows.filter(row => row.month === month).forEach(row => {
        const rev = parseFloat(row.revenue || "0")
        const hk3 = parseFloat(row.hk3 || "0")
        if (row.bg === "B2B") {
          // B2B: KHÔNG dùng Supabase analytics_channel_costs (double-count với Turso per-customer).
          // Supabase lưu platform fee/commission theo kênh; Turso lưu cùng loại chi phí theo KH.
          // Nếu cộng cả 2: b2bCCAct bị inflate 2x → CM1 âm ảo. Chỉ dùng 1 nguồn duy nhất (Turso).
          b2bHk3Act += hk3
        } else {
          const cc = computeChannelCost(channelCosts, row.channel, month, rev, mStart, actualEnd, row.source_code)
          b2cCCAct += cc
          b2cHk3Act += hk3
        }
      })
      // B2B channel cost: CHỈ dùng Turso per-customer costs → nhất quán với bảng "B2B Chi tiết theo Nhóm × Tháng".
      b2bCCAct = b2bCustCostByMonth(month, gcElapsedRatio)

      const b2bGCBudget = groupCosts.filter(c => c.group_name === "B2B" && c.month === month).reduce((s, c) => s + c.amount, 0)
      const b2cGCBudget = groupCosts.filter(c => c.group_name === "B2C" && c.month === month).reduce((s, c) => s + c.amount, 0)

      const b2bRev = r(b2bRevAct * factor); const b2bGp = r(b2bGpAct * factor)
      const b2cRev = r(b2cRevAct * factor); const b2cGp = r(b2cGpAct * factor)
      const b2bCC = r(isProjected ? b2bCCAct * factor : b2bCCAct)
      const b2cCC = r(isProjected ? b2cCCAct * factor : b2cCCAct)
      // Group Cost: projected dùng full budget; tháng hoàn thành cũng full budget (gcRatio=1);
      // tháng hiện tại chưa chiếu (< MIN_DAYS) → dùng pro-rata thực tế (gcRatio=elapsed/dim).
      const b2bGC = r(isProjected ? b2bGCBudget : b2bGCBudget * gcElapsedRatio)
      const b2cGC = r(isProjected ? b2cGCBudget : b2cGCBudget * gcElapsedRatio)
      const b2bCm1 = b2bGp - b2bCC - b2bGC
      const b2cCm1 = b2cGp - b2cCC - b2cGC

      const b2bGCAct = r(b2bGCBudget * gcElapsedRatio)
      const b2cGCAct = r(b2cGCBudget * gcElapsedRatio)
      const b2bCm1Act = b2bGpAct - b2bCCAct - b2bGCAct
      const b2cCm1Act = b2cGpAct - b2cCCAct - b2cGCAct

      const totRev = b2bRev + b2cRev; const totGp = b2bGp + b2cGp
      const totCC = b2bCC + b2cCC; const totGC = b2bGC + b2cGC
      const totCm1 = b2bCm1 + b2cCm1

      const hk3Act = parseFloat(hk3Rows.find(h => h.month === month)?.hk3 || "0")
      const hk3Rev = r(hk3Act * factor)
      const b2bHk3Rev = r(b2bHk3Act * factor)
      const b2cHk3Rev = r(b2cHk3Act * factor)
      const hk3Pct = pct(hk3Rev, totRev)

      const row = (
        rev: number, gp: number, cc: number, gc: number, cm1: number, hk3: number,
        revAct: number, gpAct: number, ccAct: number, gcAct: number, cm1ActVal: number, hk3ActVal: number
      ) => ({
        revenue: rev, gp, gpPct: pct(gp, rev),
        channelCost: cc, groupCost: gc,
        cm1, cm1Pct: pct(cm1, rev),
        hk3Pct: pct(hk3, rev),
        actualRevenue: r(isProjected ? revAct : rev),
        actualGp: r(isProjected ? gpAct : gp),
        actualCc: r(isProjected ? ccAct : cc),
        actualGc: r(isProjected ? gcAct : gc),
        actualCm1: r(isProjected ? cm1ActVal : cm1),
        actualHk3: r(isProjected ? hk3ActVal : hk3),
      })

      return {
        month,
        isProjected,
        factor: isProjected ? Math.round(factor * 100) / 100 : 1,
        elapsed: mr.elapsed,
        dim: mr.dim,
        hk3Pct,
        hk3Rev,
        actualHk3: r(hk3Act),
        total: row(totRev, totGp, totCC, totGC, totCm1, hk3Rev,
          b2bRevAct + b2cRevAct, b2bGpAct + b2cGpAct, b2bCCAct + b2cCCAct,
          b2bGCAct + b2cGCAct, b2bCm1Act + b2cCm1Act, hk3Act),
        b2b: row(b2bRev, b2bGp, b2bCC, b2bGC, b2bCm1, b2bHk3Rev,
          b2bRevAct, b2bGpAct, b2bCCAct, b2bGCAct, b2bCm1Act, b2bHk3Act),
        b2c: row(b2cRev, b2cGp, b2cCC, b2cGC, b2cCm1, b2cHk3Rev,
          b2cRevAct, b2cGpAct, b2cCCAct, b2cGCAct, b2cCm1Act, b2cHk3Act),
      }
    })

    const qtotals = summary.reduce(
      (acc, m) => ({
        revenue: acc.revenue + m.total.revenue,
        gp: acc.gp + m.total.gp,
        channelCost: acc.channelCost + m.total.channelCost,
        groupCost: acc.groupCost + m.total.groupCost,
        cm1: acc.cm1 + m.total.cm1,
        hk3Rev: (acc as any).hk3Rev + m.hk3Rev,
        b2bRevenue: (acc as any).b2bRevenue + m.b2b.revenue,
        b2bGp: (acc as any).b2bGp + m.b2b.gp,
        b2bCC: (acc as any).b2bCC + m.b2b.channelCost,
        b2bGC: (acc as any).b2bGC + m.b2b.groupCost,
        b2bCm1: (acc as any).b2bCm1 + m.b2b.cm1,
        b2cRevenue: (acc as any).b2cRevenue + m.b2c.revenue,
        b2cGp: (acc as any).b2cGp + m.b2c.gp,
        b2cCC: (acc as any).b2cCC + m.b2c.channelCost,
        b2cGC: (acc as any).b2cGC + m.b2c.groupCost,
        b2cCm1: (acc as any).b2cCm1 + m.b2c.cm1,
      }),
      { revenue: 0, gp: 0, channelCost: 0, groupCost: 0, cm1: 0, hk3Rev: 0, b2bRevenue: 0, b2bGp: 0, b2bCC: 0, b2bGC: 0, b2bCm1: 0, b2cRevenue: 0, b2cGp: 0, b2cCC: 0, b2cGC: 0, b2cCm1: 0 },
    ) as any
    const quarterTotal = {
      revenue: qtotals.revenue,
      gp: qtotals.gp,
      gpPct: pct(qtotals.gp, qtotals.revenue),
      channelCost: qtotals.channelCost,
      groupCost: qtotals.groupCost,
      cm1: qtotals.cm1,
      cm1Pct: pct(qtotals.cm1, qtotals.revenue),
      hk3Pct: pct(qtotals.hk3Rev, qtotals.revenue),
      b2b: { revenue: qtotals.b2bRevenue, gp: qtotals.b2bGp, gpPct: pct(qtotals.b2bGp, qtotals.b2bRevenue), channelCost: qtotals.b2bCC, groupCost: qtotals.b2bGC, cm1: qtotals.b2bCm1, cm1Pct: pct(qtotals.b2bCm1, qtotals.b2bRevenue) },
      b2c: { revenue: qtotals.b2cRevenue, gp: qtotals.b2cGp, gpPct: pct(qtotals.b2cGp, qtotals.b2cRevenue), channelCost: qtotals.b2cCC, groupCost: qtotals.b2cGC, cm1: qtotals.b2cCm1, cm1Pct: pct(qtotals.b2cCm1, qtotals.b2cRevenue) },
    }

    const buildChannels = (bg: "B2B" | "B2C") => {
      const chs = [...new Set(channelRows.filter(r => r.bg === bg).map(r => r.channel))].filter(Boolean)
      return chs.map(ch => {
        let totalRevenue = 0
        const chMonths = monthMeta.filter(mr => !mr.isFuture).map((mr, i) => {
          const { month, mStart, actualEnd, isProjected, factor } = mr
          const rowData = channelRows.find(r => r.channel === ch && r.month === month && r.bg === bg)
          const revAct = parseFloat(rowData?.revenue || "0")
          const gpAct = parseFloat(rowData?.gp || "0")
          const hk3Act = parseFloat(rowData?.hk3 || "0")
          const ccAct = rowData ? computeChannelCost(channelCosts, ch, month, revAct, mStart, actualEnd, rowData.source_code) : 0
          const rev = r(revAct * factor)
          const gp = r(gpAct * factor)
          const hk3 = r(hk3Act * factor)
          const cc = r(isProjected ? ccAct * factor : ccAct)
          const cm1 = gp - cc
          totalRevenue += rev
          return {
            month, revenue: rev, gp, channelCost: cc, cm1, cm1Pct: pct(cm1, rev),
            three_hk_rev: hk3, three_hk_pct: pct(hk3, rev),
            isProjected,
            ...(isProjected && { actualRevenue: r(revAct), actualGp: r(gpAct), actualCc: r(ccAct), actualCm1: r(gpAct - ccAct) }),
            _i: i
          }
        })
        const withMom = chMonths.map((m, i) => {
          const prev = chMonths[i - 1]
          const momPct = prev && prev.revenue > 0
            ? Math.round((m.revenue - prev.revenue) / prev.revenue * 1000) / 10
            : null
          const { _i, ...rest } = m
          return { ...rest, momPct }
        })
        return { name: ch, totalRevenue, months: withMom }
      })
        .filter(ch => ch.totalRevenue > 0)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
    }

    const elapsed_days = monthMeta.filter(mr => !mr.isFuture).reduce((s, mr) => s + mr.elapsed, 0)
    const quarter_days = monthMeta.reduce((s, mr) => s + mr.dim, 0)

    const prevB2B = (prevGroupRows as any[]).find((row: any) => row.bg === "B2B")
    const prevB2C = (prevGroupRows as any[]).find((row: any) => row.bg === "B2C")

    // prevB2BCm1/prevB2CCm1: dùng Supabase channel costs cho B2C (nhất quán current Q).
    // B2B prev Q: dùng Turso per-customer costs (amount only, vì không có per-customer revenue Q trước).
    // Nếu Turso Q trước không có data → prevB2BCm1 = GP (không trừ cost), QoQ sẽ lệch — chấp nhận.
    let prevB2BCm1 = 0, prevB2CCm1 = 0
    const prevB2BGpByMonth = new Map<string, number>()
      ; (prevChannelRows as any[]).forEach((row: any) => {
        const mStart = `${row.month}-01`
        const mEnd = new Date(parseInt(row.month.split("-")[0]), parseInt(row.month.split("-")[1]), 0).toISOString().split("T")[0]
        const rev = parseFloat(row.revenue || "0")
        const gp = parseFloat(row.gp || "0")
        if (row.bg === "B2B") {
          prevB2BGpByMonth.set(row.month, (prevB2BGpByMonth.get(row.month) ?? 0) + gp)
        } else {
          const cc = computeChannelCost(prevChannelCosts, row.channel, row.month, rev, mStart, mEnd)
          prevB2CCm1 += gp - cc
        }
      })
    prevB2BGpByMonth.forEach((gp) => { prevB2BCm1 += gp })
    prevQMonths.forEach(m => {
      // Trừ Turso B2B customer costs quý trước (amount type only — không có per-customer revenue Q trước)
      prevCustomerCostMap.forEach((rec: CostRecord, key: string) => {
        if (key.slice(0, 7) !== m) return
        let lines: Array<{ type: string; value: number }> = []
        if (rec.cost_lines) { try { lines = JSON.parse(rec.cost_lines) } catch {} }
        const amountCost = lines.length > 0
          ? lines.filter(l => l?.type === "amount").reduce((s, l) => s + (Number(l?.value) || 0), 0)
          : (rec.cost_type === "amount" ? (Number(rec.cost_value) || 0) : 0)
        prevB2BCm1 -= amountCost
      })
      prevB2BCm1 -= prevGroupCosts.filter((c: any) => c.group_name === "B2B" && c.month === m).reduce((s: number, c: any) => s + c.amount, 0)
      prevB2CCm1 -= prevGroupCosts.filter((c: any) => c.group_name === "B2C" && c.month === m).reduce((s: number, c: any) => s + c.amount, 0)
    })

    const prevQuarterTotals = {
      b2bRevenue: Math.round(parseFloat(prevB2B?.revenue || "0")),
      b2bGp: Math.round(parseFloat(prevB2B?.gp || "0")),
      b2bCm1: Math.round(prevB2BCm1),
      b2cRevenue: Math.round(parseFloat(prevB2C?.revenue || "0")),
      b2cGp: Math.round(parseFloat(prevB2C?.gp || "0")),
      b2cCm1: Math.round(prevB2CCm1),
    }

    return NextResponse.json({
      quarter, year, months,
      summary,
      quarterTotal,
      prevQuarterTotals,
      b2bChannels: buildChannels("B2B"),
      b2cChannels: buildChannels("B2C"),
      elapsed_days,
      quarter_days,
    }, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[quarterly-report]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}