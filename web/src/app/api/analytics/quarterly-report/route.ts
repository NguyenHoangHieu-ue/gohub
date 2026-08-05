import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, noCache, shipFilter, internalOpsFilter } from "@/lib/analytics-helpers"
import { fetchCosts, getDaysInMonth, getDaysInRange, matchChannelCost } from "@/lib/bod-data"
import { fetchQuarterlySettings, makeExcludeSql, exclHash } from "@/lib/quarterly-settings"

const COST_KEYS = ["ads", "platformFee", "sponsorProducts", "media"] as const

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
  // Op-cost nhất quán TOÀN hệ thống (BOD/Channels/B2B/B2C — bod-data.ts): amount cộng dồn (pro-rata theo
  // ratio ngày), percent CỘNG HẾT tất cả loại phí % (KHÔNG lấy MAX). Trước đây lấy MAX theo gohub.py nhưng
  // đã chốt SUM để CM1 cùng 1 kênh khớp giữa Quarterly và các tab (QUARTERLY-1, s126). Dùng matchChannelCost:
  // ưu tiên source_code (ổn định khi rename) → fallback channel name.
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
  const includeShip        = searchParams.get("includeShip")        === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"

  // Dùng fact_fulfillment_revenue + fulfiled_date — nhất quán với B2B/B2C Performance (cùng date semantics).
  // fulfiled_date = ngày hoàn thành đơn hàng (revenue recognition). created_date → fact_sales_revenue (không có GP).
  const DATE_COL = "fulfiled_date"
  const MAIN_TABLE = "fact_fulfillment_revenue"
  const REV_COL = "fulfilled_revenue_amount_vnd"
  const GP_COL = "gross_profit_vnd"

  const months = getQuarterMonths(quarter, year)
  // Mốc dữ liệu = HÔM QUA (trước ngày hiện tại 1 ngày): gohub_dw ETL cập nhật theo ngày,
  // hôm nay chưa đủ dữ liệu → chốt tới hết hôm qua cho khớp số đối chiếu.
  const asOf = new Date(today)
  asOf.setDate(asOf.getDate() - 1)
  const todayStr = asOf.toISOString().split("T")[0]  // "as-of" = hôm qua (dùng làm mốc cắt dữ liệu)

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
  // Load settings (excluded customers) — dynamic, không cache hoặc re-fetch mỗi request
  const { excludedCustomers } = await fetchQuarterlySettings()
  const EXCLUDE_CUST_SQL = makeExcludeSql(excludedCustomers)
  // Loại KH có bảng giá chứa "INACTIVE" (vd: "[INACTIVE] Sponsor") khỏi mọi tổng B2B/B2C
  const INACTIVE_FILTER = `AND UPPER(COALESCE(c.price_list_name, '')) NOT LIKE '%INACTIVE%' ${sfx}`

  // Previous quarter dates (cho QoQ)
  const qNum = parseInt(quarter.replace("Q", ""))
  const prevQNum = qNum === 1 ? 4 : qNum - 1
  const prevQYear = qNum === 1 ? year - 1 : year
  const prevQFirst = (prevQNum - 1) * 3 + 1
  const prevQStartDate = `${prevQYear}-${String(prevQFirst).padStart(2, "0")}-01`
  const prevQEndDate = new Date(prevQYear, prevQNum * 3, 0).toISOString().split("T")[0]
  const prevQMonths = [0, 1, 2].map(i => `${prevQYear}-${String(prevQFirst + i).padStart(2, "0")}`)

  // v4: thêm prevChannelRows + fetchCosts(prevQMonths) để tính CM1 quý trước cho QoQ
  // v5: fix GROUP BY split bug (source_code removed from GROUP BY) + matchChannelCost prefix fix
  const rawCacheKey = `qreport_raw_v5:${quarter}:${year}:${companyCode}:${todayStr}:${exclHash(excludedCustomers)}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}`

  try {
    // ── Phần 1 + 2: gohub_dw (cache) và Supabase costs (hiện tại + quý trước) chạy SONG SONG ──
    const [rawData, { channelCosts, groupCosts }, { channelCosts: prevChannelCosts, groupCosts: prevGroupCosts }] = await Promise.all([
      cachedQuery(rawCacheKey, async () => {
      const [groupRows, channelRows, hk3Rows, prevGroupRows, prevChannelRows] = await Promise.all([
        queryAnalytics<{ month: string; bg: string; revenue: string; gp: string }>(`
          SELECT
            TO_CHAR(f.${DATE_COL}::date, 'YYYY-MM') as month,
            UPPER(COALESCE(s.group_name, 'OTHER')) as bg,
            SUM(f.${REV_COL}) as revenue,
            SUM(f.${GP_COL}) as gp
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
          WHERE f.${DATE_COL}::date >= '${qStartDate}'
            AND f.${DATE_COL}::date <= '${qEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')
            ${EXCLUDE_CUST_SQL}
            ${INACTIVE_FILTER}
          GROUP BY 1, 2
          ORDER BY 1, 2
        `),
        queryAnalytics<{ month: string; bg: string; channel: string; source_code: string; revenue: string; gp: string; hk3: string }>(`
          SELECT
            TO_CHAR(f.${DATE_COL}::date, 'YYYY-MM') as month,
            UPPER(COALESCE(s.group_name, 'OTHER')) as bg,
            TRIM(s.channel_name) as channel,
            MIN(TRIM(s.code)) as source_code,
            SUM(f.${REV_COL}) as revenue,
            SUM(f.${GP_COL}) as gp,
            SUM(CASE WHEN TRIM(f.sku) IN (
              SELECT DISTINCT TRIM(sku) FROM dim_sku
              WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
            ) THEN f.${REV_COL} ELSE 0 END) as hk3
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
          WHERE f.${DATE_COL}::date >= '${qStartDate}'
            AND f.${DATE_COL}::date <= '${qEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')
            AND s.channel_name IS NOT NULL AND TRIM(s.channel_name) != ''
            ${EXCLUDE_CUST_SQL}
            ${INACTIVE_FILTER}
          GROUP BY 1, 2, 3
          ORDER BY 1, 2, 3
        `),
        queryAnalytics<{ month: string; hk3: string }>(`
          SELECT
            TO_CHAR(f.${DATE_COL}::date, 'YYYY-MM') as month,
            SUM(CASE WHEN TRIM(f.sku) IN (
              SELECT DISTINCT TRIM(sku) FROM dim_sku
              WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
            ) THEN f.${REV_COL} ELSE 0 END) as hk3
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
          WHERE f.${DATE_COL}::date >= '${qStartDate}'
            AND f.${DATE_COL}::date <= '${qEndDate}'
            ${companyFilter}
            ${EXCLUDE_CUST_SQL}
            ${INACTIVE_FILTER}
          GROUP BY 1
        `),
        queryAnalytics<{ bg: string; revenue: string; gp: string }>(`
          SELECT UPPER(COALESCE(s.group_name,'OTHER')) as bg,
            SUM(f.${REV_COL}) as revenue, SUM(f.${GP_COL}) as gp
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
          WHERE f.${DATE_COL}::date >= '${prevQStartDate}'
            AND f.${DATE_COL}::date <= '${prevQEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name,'OTHER')) IN ('B2B','B2C')
            ${EXCLUDE_CUST_SQL}
            ${INACTIVE_FILTER}
          GROUP BY 1
        `),
        queryAnalytics<{ month: string; bg: string; channel: string; revenue: string; gp: string }>(`
          SELECT
            TO_CHAR(f.${DATE_COL}::date, 'YYYY-MM') as month,
            UPPER(COALESCE(s.group_name, 'OTHER')) as bg,
            TRIM(s.channel_name) as channel,
            SUM(f.${REV_COL}) as revenue,
            SUM(f.${GP_COL}) as gp
          FROM ${MAIN_TABLE} f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
          WHERE f.${DATE_COL}::date >= '${prevQStartDate}'
            AND f.${DATE_COL}::date <= '${prevQEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, 'OTHER')) IN ('B2B', 'B2C')
            AND s.channel_name IS NOT NULL AND TRIM(s.channel_name) != ''
            ${EXCLUDE_CUST_SQL}
            ${INACTIVE_FILTER}
          GROUP BY 1, 2, 3
        `),
      ])

      return { groupRows, channelRows, hk3Rows, prevGroupRows, prevChannelRows }
    }, QUERY_TTL_MIN, refresh),
    fetchCosts(months),       // Supabase costs hiện tại
    fetchCosts(prevQMonths),  // Supabase costs quý trước (cho CM1 QoQ)
    ])

    // ── Phần 3: Compute ────────────────────────────────────────────────────────
    const { groupRows, channelRows, hk3Rows, prevGroupRows, prevChannelRows } = rawData

    // Metadata per month: projection factor, date ranges
    const monthMeta = months.map(m => {
        const mStart = `${m}-01`
        const mEndDate = new Date(parseInt(m.split("-")[0]), parseInt(m.split("-")[1]), 0)
        const mEnd = mEndDate.toISOString().split("T")[0]
        const actualEnd = mEnd < todayStr ? mEnd : todayStr
        const dim = getDaysInMonth(m)
        const isFuture = new Date(mStart) > asOf
        const isCurrent = !isFuture && mEndDate >= asOf
        const elapsed = isFuture ? 0 : getDaysInRange(mStart, actualEnd, m)
        const isProjected = isCurrent && elapsed > 0 && elapsed < dim
        const factor = isProjected ? dim / elapsed : 1
        return { month: m, mStart, mEnd, actualEnd, dim, elapsed, isProjected, factor, isFuture }
      })

      const pct = (num: number, den: number) => den > 0 ? Math.round(num / den * 1000) / 10 : 0
      const r = Math.round

      // Summary table
      const summary = monthMeta.filter(mr => !mr.isFuture).map(mr => {
        const { month, mStart, actualEnd, isProjected, factor, elapsed, dim } = mr

        const b2bR = groupRows.find(row => row.month === month && row.bg === "B2B")
        const b2cR = groupRows.find(row => row.month === month && row.bg === "B2C")

        const b2bRevAct = parseFloat(b2bR?.revenue || "0")
        const b2bGpAct  = parseFloat(b2bR?.gp      || "0")
        const b2cRevAct = parseFloat(b2cR?.revenue  || "0")
        const b2cGpAct  = parseFloat(b2cR?.gp       || "0")

        // Channel costs + per-group 3HK (from channelRows which now has hk3)
        let b2bCCAct = 0, b2cCCAct = 0
        let b2bHk3Act = 0, b2cHk3Act = 0
        channelRows.filter(row => row.month === month).forEach(row => {
          const rev = parseFloat(row.revenue || "0")
          const cc = computeChannelCost(channelCosts, row.channel, month, rev, mStart, actualEnd, row.source_code)
          const hk3 = parseFloat(row.hk3 || "0")
          if (row.bg === "B2B") { b2bCCAct += cc; b2bHk3Act += hk3 }
          else { b2cCCAct += cc; b2cHk3Act += hk3 }
        })

        // Group-level costs: nhất quán với gohub-report/gohub.py — scale theo factor (cùng với GP, CC)
        const b2bGCBudget = groupCosts.filter(c => c.group_name === "B2B" && c.month === month).reduce((s, c) => s + c.amount, 0)
        const b2cGCBudget = groupCosts.filter(c => c.group_name === "B2C" && c.month === month).reduce((s, c) => s + c.amount, 0)

        const b2bRev = r(b2bRevAct * factor); const b2bGp = r(b2bGpAct * factor)
        const b2cRev = r(b2cRevAct * factor); const b2cGp = r(b2cGpAct * factor)
        const b2bCC = r(isProjected ? b2bCCAct * factor : b2bCCAct)
        const b2cCC = r(isProjected ? b2cCCAct * factor : b2cCCAct)
        // Group cost: monthly budget là giá trị CẢ THÁNG → projected giữ nguyên budget (không nhân factor).
        // Nhân factor sẽ thổi phồng sai (vd budget 10tr × factor 6.2 = 62tr thay vì 10tr).
        const b2bGC = r(b2bGCBudget)
        const b2cGC = r(b2cGCBudget)
        const b2bCm1 = b2bGp - b2bCC - b2bGC
        const b2cCm1 = b2cGp - b2cCC - b2cGC

        // Actual group cost: pro-rate theo elapsed/dim cho tháng đang chạy (partial month)
        const gcElapsedRatio = isProjected && dim > 0 ? elapsed / dim : 1
        const b2bGCAct = r(b2bGCBudget * gcElapsedRatio)
        const b2cGCAct = r(b2cGCBudget * gcElapsedRatio)
        // Actual CM1 (trừ group cost pro-rated, không phải full budget)
        const b2bCm1Act = b2bGpAct - b2bCCAct - b2bGCAct
        const b2cCm1Act = b2cGpAct - b2cCCAct - b2cGCAct

        const totRev = b2bRev + b2cRev; const totGp = b2bGp + b2cGp
        const totCC  = b2bCC  + b2cCC;  const totGC  = b2bGC  + b2cGC
        const totCm1 = b2bCm1 + b2cCm1

        // 3HK revenue (total from hk3Rows, per-group from channelRows)
        const hk3Act = parseFloat(hk3Rows.find(h => h.month === month)?.hk3 || "0")
        const hk3Rev = r(hk3Act * factor)
        const b2bHk3Rev = r(b2bHk3Act * factor)
        const b2cHk3Rev = r(b2cHk3Act * factor)
        const hk3Pct = pct(hk3Rev, totRev)

        // row() returns projected values + actual values (for computeSummary in frontend)
        const row = (
          rev: number, gp: number, cc: number, gc: number, cm1: number, hk3: number,
          revAct: number, gpAct: number, ccAct: number, gcAct: number, cm1ActVal: number, hk3ActVal: number
        ) => ({
          revenue: rev, gp, gpPct: pct(gp, rev),
          channelCost: cc, groupCost: gc,
          cm1, cm1Pct: pct(cm1, rev),
          hk3Pct: pct(hk3, rev),
          actualRevenue: r(isProjected ? revAct : rev),
          actualGp:      r(isProjected ? gpAct  : gp),
          actualCc:      r(isProjected ? ccAct  : cc),
          actualGc:      r(isProjected ? gcAct  : gc),
          actualCm1:     r(isProjected ? cm1ActVal : cm1),
          actualHk3:     r(isProjected ? hk3ActVal : hk3),
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

      // Quarter totals (kept for backward compat — frontend now uses computeSummary)
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

      // Channel breakdown per business group
      const buildChannels = (bg: "B2B" | "B2C") => {
        const chs = [...new Set(channelRows.filter(r => r.bg === bg).map(r => r.channel))].filter(Boolean)
        return chs.map(ch => {
          let totalRevenue = 0
          const chMonths = monthMeta.filter(mr => !mr.isFuture).map((mr, i) => {
            const { month, mStart, actualEnd, isProjected, factor } = mr
            const rowData = channelRows.find(r => r.channel === ch && r.month === month && r.bg === bg)
            const revAct = parseFloat(rowData?.revenue || "0")
            const gpAct  = parseFloat(rowData?.gp      || "0")
            const hk3Act = parseFloat(rowData?.hk3     || "0")
            const ccAct  = rowData ? computeChannelCost(channelCosts, ch, month, revAct, mStart, actualEnd, rowData.source_code) : 0
            const rev = r(revAct * factor)
            const gp  = r(gpAct  * factor)
            const hk3 = r(hk3Act * factor)
            const cc  = r(isProjected ? ccAct * factor : ccAct)
            const cm1 = gp - cc
            totalRevenue += rev
            return { month, revenue: rev, gp, channelCost: cc, cm1, cm1Pct: pct(cm1, rev),
                     three_hk_rev: hk3, three_hk_pct: pct(hk3, rev),
                     isProjected,
                     ...(isProjected && { actualRevenue: r(revAct), actualGp: r(gpAct), actualCc: r(ccAct), actualCm1: r(gpAct - ccAct) }),
                     _i: i }
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

      // elapsed_days và quarter_days cho frontend computeSummary() (theo reference gohub.html)
      const elapsed_days = monthMeta.filter(mr => !mr.isFuture).reduce((s, mr) => s + mr.elapsed, 0)
      const quarter_days = monthMeta.reduce((s, mr) => s + mr.dim, 0)

    // Tổng quý trước cho QoQ (CM1 = GP - channel cost - group cost)
    const prevB2B = (prevGroupRows as any[]).find((row: any) => row.bg === "B2B")
    const prevB2C = (prevGroupRows as any[]).find((row: any) => row.bg === "B2C")

    // Tính CM1 quý trước từ prevChannelRows + prevGroupCosts (quý trước đã hoàn chỉnh, không cần pro-rata)
    let prevB2BCm1 = 0, prevB2CCm1 = 0
    ;(prevChannelRows as any[]).forEach((row: any) => {
      const mStart = `${row.month}-01`
      const mEnd = new Date(parseInt(row.month.split("-")[0]), parseInt(row.month.split("-")[1]), 0).toISOString().split("T")[0]
      const rev = parseFloat(row.revenue || "0")
      const gp  = parseFloat(row.gp      || "0")
      const cc  = computeChannelCost(prevChannelCosts, row.channel, row.month, rev, mStart, mEnd)
      if (row.bg === "B2B") prevB2BCm1 += gp - cc
      else                  prevB2CCm1 += gp - cc
    })
    prevQMonths.forEach(m => {
      prevB2BCm1 -= prevGroupCosts.filter((c: any) => c.group_name === "B2B" && c.month === m).reduce((s: number, c: any) => s + c.amount, 0)
      prevB2CCm1 -= prevGroupCosts.filter((c: any) => c.group_name === "B2C" && c.month === m).reduce((s: number, c: any) => s + c.amount, 0)
    })

    const prevQuarterTotals = {
      b2bRevenue: Math.round(parseFloat(prevB2B?.revenue || "0")),
      b2bGp:      Math.round(parseFloat(prevB2B?.gp      || "0")),
      b2bCm1:     Math.round(prevB2BCm1),
      b2cRevenue: Math.round(parseFloat(prevB2C?.revenue  || "0")),
      b2cGp:      Math.round(parseFloat(prevB2C?.gp       || "0")),
      b2cCm1:     Math.round(prevB2CCm1),
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
