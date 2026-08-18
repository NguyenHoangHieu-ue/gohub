import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, noCache, shipFilter, internalOpsFilter } from "@/lib/analytics-helpers"
import { getDaysInMonth, getDaysInRange, fetchCosts } from "@/lib/bod-data"
import { fetchCustomerCosts, calcRecordCost, calcRecordCostProjected } from "@/lib/b2b-customer-cost"
import { fetchQuarterlySettings, makeClassifyTier, makeExcludeSql, exclHash } from "@/lib/quarterly-settings"
import { buildQuarterMonthMeta } from "@/lib/analytics-engine/quarter-projection"

// Route nặng (per-customer B2B + Turso costs) → cho 60s (khớp vercel.json) tránh 504 treo FE.
export const maxDuration = 60
export const dynamic = "force-dynamic"

function classifyRegion(priceListName: string | null, currencyCode: string | null): string {
  const p = (priceListName || "").toUpperCase()
  const c = (currencyCode || "").toUpperCase()
  if (p.includes(" US") || p.startsWith("US ") || c === "USD") return "US"
  if (p.includes(" VN") || p.startsWith("VN ") || c === "VND") return "VN"
  return "VN"
}

function getQuarterMonths(quarter: string, year: number): string[] {
  const q = parseInt(quarter.replace("Q", ""))
  const start = (q - 1) * 3 + 1
  return [0, 1, 2].map(i => {
    const m = start + i
    return `${year}-${String(m).padStart(2, "0")}`
  })
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const guard = analyticsGuard(req, session)
  if (guard) return guard

  const { searchParams } = req.nextUrl
  const today = new Date()
  const year = parseInt(searchParams.get("year") || String(today.getFullYear()))
  const quarter = searchParams.get("quarter") || `Q${Math.ceil((today.getMonth() + 1) / 3)}`
  const regionFilter = searchParams.get("region") || "ALL"  // ALL | VN | US
  const companyCode = searchParams.get("companyCode") || "ALL"
  // Ship/InternalOps filter — PHẢI khớp quarterly-report để tier B2B = summary B2B (mặc định loại phí ship).
  const includeShip = searchParams.get("includeShip") === "1"
  const includeInternalOps = searchParams.get("includeInternalOps") === "1"
  const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)}`

  const months = getQuarterMonths(quarter, year)
  // Mốc dữ liệu = HÔM QUA (trước hiện tại 1 ngày) — nhất quán với quarterly-report.
  const asOf = new Date(today)
  asOf.setDate(asOf.getDate() - 1)
  const todayStr = asOf.toISOString().split("T")[0]
  const qStartDate = `${months[0]}-01`
  const lastMonthEndDate = new Date(parseInt(months[2].split("-")[0]), parseInt(months[2].split("-")[1]), 0)
  const qEndDate = lastMonthEndDate < asOf ? lastMonthEndDate.toISOString().split("T")[0] : todayStr

  if (new Date(qStartDate) > today) {
    return NextResponse.json({ quarter, year, months, tiers: [] }, { headers: CACHE_HEADERS })
  }

  const companyFilter = companyCode !== "ALL" ? `AND f.company_code = '${companyCode}'` : ""
  void regionFilter
  const refresh = noCache(req) || searchParams.get("refresh") === "1"

  // Load settings (dynamic tier + exclusion) — luôn fresh mỗi request
  const { excludedCustomers, tierKeywords } = await fetchQuarterlySettings()
  const classifyTier = makeClassifyTier(tierKeywords)

  // Previous quarter dates + months (dùng để tính QoQ bằng CM1)
  const q = parseInt(quarter.replace("Q", ""))
  const prevQ = q === 1 ? 4 : q - 1
  const prevYear = q === 1 ? year - 1 : year
  const prevQFirstMonth = (prevQ - 1) * 3 + 1
  const prevQStartDate = `${prevYear}-${String(prevQFirstMonth).padStart(2, "0")}-01`
  const prevQEndDate = new Date(prevYear, prevQ * 3, 0).toISOString().split("T")[0]
  const prevQMonths = [0, 1, 2].map(i => `${prevYear}-${String(prevQFirstMonth + i).padStart(2, "0")}`)

  // Cache key bao gồm excl hash → auto-invalidate khi settings thay đổi
  // v8: cộng ước tính T9 CH.Cost (dùng T8 record làm fallback)
  const rawCacheKey = `qb2b_raw_v8:${quarter}:${year}:${companyCode}:${todayStr}:${exclHash(excludedCustomers)}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}`

  try {
    // ── Phần 1+2+3+4: gohub_dw (cache), Turso customer costs, prev costs, Supabase group costs — SONG SONG ──
    const [rawData, costMap, prevCostMap, { groupCosts }] = await Promise.all([
      cachedQuery(rawCacheKey, async () => {
        // SQL fragment: loại KH khỏi B2B (an toàn khi list rỗng)
        const exclFilter = excludedCustomers.length > 0
          ? `AND COALESCE(c.name, TRIM(f.customer_code)) NOT IN (${excludedCustomers.map(n => `'${n.replace(/'/g, "''")}'`).join(",")})`
          : ""

        const [customerRows, prevQuarterRows] = await Promise.all([
          queryAnalytics<{
            month: string; customer_code: string; customer_name: string
            price_list_name: string | null; currency_code: string | null; channel_name: string
            revenue: string; gm: string; hk3: string
          }>(`
          SELECT
            TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') as month,
            TRIM(f.customer_code) as customer_code,
            COALESCE(c.name, TRIM(f.customer_code)) as customer_name,
            c.price_list_name, c.currency_code,
            COALESCE(TRIM(s.channel_name), '') as channel_name,
            SUM(f.fulfilled_revenue_amount_vnd) as revenue,
            SUM(f.gross_profit_vnd) as gm,
            SUM(CASE WHEN sk.sku IS NOT NULL THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) as hk3
          FROM fact_fulfillment_revenue f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
          LEFT JOIN (
            SELECT DISTINCT TRIM(sku) as sku FROM dim_sku
            WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
          ) sk ON TRIM(f.sku) = sk.sku
          WHERE f.fulfiled_date::date >= '${qStartDate}'
            AND f.fulfiled_date::date <= '${qEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
            AND NOT (UPPER(COALESCE(c.price_list_name, '')) LIKE '%INACTIVE%')
            ${exclFilter}
            ${sfx}
          GROUP BY 1, 2, 3, 4, 5, 6
          ORDER BY 1, 2
        `),
          queryAnalytics<{ customer_code: string; gm: string; revenue: string }>(`
          SELECT TRIM(f.customer_code) as customer_code,
            SUM(f.gross_profit_vnd) as gm,
            SUM(f.fulfilled_revenue_amount_vnd) as revenue
          FROM fact_fulfillment_revenue f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
          WHERE f.fulfiled_date::date >= '${prevQStartDate}'
            AND f.fulfiled_date::date <= '${prevQEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
            ${exclFilter}
            ${sfx}
          GROUP BY 1
        `),
        ])

        return { customerRows, prevQuarterRows }
      }, QUERY_TTL_MIN, refresh),
      fetchCustomerCosts(months),          // current quarter Turso costs
      fetchCustomerCosts(prevQMonths),     // prev quarter Turso costs (để tính QoQ CM1)
      fetchCosts(months).catch(() => ({ channelCosts: [], groupCosts: [] as Array<{ group_name: string; month: string; amount: number }> })),  // Supabase group costs
    ])

    // ── Phần 3: Compute (pure, fast ~1ms) ────────────────────────────────────────
    const { customerRows, prevQuarterRows } = rawData

    // Previous quarter: GP map và CM1 map (QoQ so sánh bằng CM1 = GP - CH.Cost quý trước)
    const prevQuarterMap = new Map<string, { gm: number; revenue: number }>()
    const prevCm1Map = new Map<string, number>()
    prevQuarterRows.forEach((r: any) => {
      const code = r.customer_code
      const prevGm = parseFloat(r.gm || "0")
      const prevRev = parseFloat(r.revenue || "0")
      prevQuarterMap.set(code, { gm: prevGm, revenue: prevRev })
      // Tính CM1 quý trước = GP − CH.Cost (Turso), phân bổ revenue đều 3 tháng
      let prevCost = 0
      prevQMonths.forEach(m => {
        const rec = prevCostMap.get(`${m}_${code}`)
        if (rec) prevCost += calcRecordCost(rec, prevRev / 3)
      })
      prevCm1Map.set(code, prevGm - prevCost)
    })

    // Month metadata (for pro-rata) — dùng shared engine (nhất quán với quarterly-report)
    const monthMeta = buildQuarterMonthMeta(months, asOf, todayStr)

    // Quarter-level factor — dùng cho %QoQ tier (nhất quán với Tổng Quý)
    const elapsedQDays = monthMeta.reduce((s, mr) => s + mr.elapsed, 0)
    const quarterQDays = monthMeta.reduce((s, mr) => s + getDaysInMonth(mr.month), 0)
    const qFactor = elapsedQDays > 0 ? quarterQDays / elapsedQDays : 1
    const hasProjected = monthMeta.some(mr => mr.isProjected)

    // Aggregate customer data — lưu giá trị PROJECTED + rawRevenue/rawGm (actual, để tính actual vs PR).
    interface CustMonth { revenue: number; gm: number; hk3: number; rawRevenue: number; rawGm: number; factor: number }
    interface CustomerAgg {
      code: string; name: string; priceListName: string | null; currencyCode: string | null
      tier: string; region: string
      months: Map<string, CustMonth>
    }
    const customerMap = new Map<string, CustomerAgg>()

    customerRows.forEach(row => {
      // Bỏ KH có bảng giá chứa "INACTIVE" (vd: "[INACTIVE] Sponsor")
      if (row.price_list_name?.toUpperCase().includes("INACTIVE")) return
      const code = row.customer_code
      if (!customerMap.has(code)) {
        const pln = row.price_list_name
        const cur = row.currency_code
        customerMap.set(code, {
          code, name: row.customer_name,
          priceListName: pln, currencyCode: cur,
          tier: classifyTier(pln),
          region: classifyRegion(pln, cur),
          months: new Map(),
        })
      }
      const cust = customerMap.get(code)!
      const mr = monthMeta.find(m => m.month === row.month)
      if (!mr) return
      const { factor } = mr

      const revAct = parseFloat(row.revenue || "0")
      const gmAct = parseFloat(row.gm || "0")
      const hk3Act = parseFloat(row.hk3 || "0")

      const existing = cust.months.get(row.month)
      if (existing) {
        existing.revenue += revAct * factor
        existing.gm += gmAct * factor
        existing.hk3 += hk3Act * factor
        existing.rawRevenue += revAct
        existing.rawGm += gmAct
      } else {
        cust.months.set(row.month, {
          revenue: revAct * factor, gm: gmAct * factor, hk3: hk3Act * factor,
          rawRevenue: revAct, rawGm: gmAct, factor,
        })
      }
    })

    const customers = Array.from(customerMap.values())

    const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 1000) / 10 : 0
    const r2 = (n: number) => Math.round(n)

    // Build customer summaries
    const TIER_ORDER = ["Strategic", "VIP", "Gold", "Silver"]
    type MAgg = { revenue: number; gm: number; cc: number; cm1: number; hk3: number; rawRevenue: number; rawGm: number; rawCc: number }
    const emptyMAgg = (): MAgg => ({ revenue: 0, gm: 0, cc: 0, cm1: 0, hk3: 0, rawRevenue: 0, rawGm: 0, rawCc: 0 })
    interface CustMonthCost { cost_lines: string; cost_type: string; cost_value: number; revenue: number }
    interface CustMonthSummary {
      revenue: number; gm: number; cc: number; cm1: number; cm1Pct: number; hk3Pct: number
      isProjected: boolean
      actualRevenue?: number; actualGm?: number; actualCc?: number; actualCm1?: number
    }
    interface CustRow {
      code: string; name: string; region: string; priceListName: string | null
      revenue: number; gm: number; gmPct: number; cc: number; cm1: number
      cm1Pct: number; qoqPct: number | null; hk3Rev: number; hk3Pct: number
      prevCm1: number   // CM1 quý trước (để FE recompute QoQ với CM1 gồm ước tính T9)
      monthsCost: Record<string, CustMonthCost>
      monthSummary: Record<string, CustMonthSummary>   // per-month breakdown
      hasProjected: boolean
      actualRevenue: number; actualGm: number; actualCc: number; actualCm1: number
    }
    const tierMap = new Map<string, {
      tier: string
      custList: CustRow[]
      monthAgg: Map<string, MAgg>
      monthAggR: { VN: Map<string, MAgg>; US: Map<string, MAgg> }
    }>()

    TIER_ORDER.forEach(tier => tierMap.set(tier, {
      tier, custList: [], monthAgg: new Map(),
      monthAggR: { VN: new Map(), US: new Map() },
    }))

    customers.forEach(cust => {
      const tier = tierMap.get(cust.tier) ?? tierMap.get("Strategic")!
      const reg: "VN" | "US" = cust.region === "US" ? "US" : "VN"
      let totRev = 0, totGm = 0, totCc = 0, totHk3 = 0
      let totActRev = 0, totActGm = 0, totActCc = 0
      const monthsCost: Record<string, CustMonthCost> = {}
      const monthSummary: Record<string, CustMonthSummary> = {}

      months.forEach(m => {
        const md = cust.months.get(m)
        const rec = costMap.get(`${m}_${cust.code}`)
        const meta = monthMeta.find(x => x.month === m)
        const isProj = meta?.isProjected ?? false
        const isFuture = meta?.isFuture ?? false

        // Tháng tương lai (T9): ước tính CH.Cost từ record của T9 (nếu đã nhập) hoặc fallback T8.
        if (isFuture) {
          const prevIdx = months.indexOf(m) - 1
          const prevM = prevIdx >= 0 ? months[prevIdx] : undefined
          const fallbackRec = prevM ? costMap.get(`${prevM}_${cust.code}`) : undefined
          const futureRec = rec ?? fallbackRec
          if (futureRec) {
            // amount: full monthly amount. percent: × prev month projected revenue làm ước tính.
            const prevMd = prevM ? cust.months.get(prevM) : undefined
            const estRev = prevMd ? prevMd.rawRevenue * prevMd.factor : 0
            const estCost = calcRecordCostProjected(futureRec, estRev, 1, 1)
            totCc += estCost
          }
          return
        }

        // Tỷ lệ ngày đã qua trong tháng (vd: 4 / 31)
        const elapsedRatio = meta && meta.dim > 0 ? meta.elapsed / meta.dim : 1

        // 1. Projected CH.Cost (dự phóng cả tháng): amount GIỮ NGUYÊN (elapsedRatio=1),
        //    percent áp trên projected revenue (rawRevenue × factor).
        const monthCost = md ? calcRecordCostProjected(rec, md.rawRevenue, md.factor, 1) : 0

        // 2. Actual CH.Cost (thực tế tới hôm nay): amount × elapsedRatio (pro-rata ngày đã qua),
        //    percent áp trên actual revenue.
        const rawCc = md ? calcRecordCostProjected(rec, md.rawRevenue, 1, elapsedRatio) : 0

        monthsCost[m] = {
          cost_lines: rec?.cost_lines ?? "[]",
          cost_type: rec?.cost_type ?? "amount",
          cost_value: rec?.cost_value ?? 0,
          revenue: md ? r2(md.revenue) : 0,
        }
        if (md) {
          const mCm1 = md.gm - monthCost
          // isRunning = tháng đang chạy (không phải tương lai, chưa kết thúc) — bao gồm cả elapsed < MIN_PROJECT_DAYS.
          const isRunning = !!(meta && !meta.isFuture && meta.elapsed > 0 && meta.elapsed < meta.dim)
          monthSummary[m] = {
            revenue: r2(md.revenue), gm: r2(md.gm), cc: r2(monthCost),
            cm1: r2(mCm1), cm1Pct: pct(mCm1, md.revenue), hk3Pct: pct(md.hk3, md.revenue),
            isProjected: isProj,
            ...(isRunning && {
              ...(isProj && { actualRevenue: r2(md.rawRevenue), actualGm: r2(md.rawGm) }),
              actualCc: r2(rawCc),
              actualCm1: r2(md.rawGm - rawCc),
            }),
          }
          totRev += md.revenue; totGm += md.gm; totCc += monthCost; totHk3 += md.hk3
          totActRev += md.rawRevenue; totActGm += md.rawGm; totActCc += rawCc

          const acc = (map: Map<string, MAgg>) => {
            const ta = map.get(m) || emptyMAgg()
            ta.revenue += md.revenue; ta.gm += md.gm; ta.cc += monthCost
            ta.cm1 += md.gm - monthCost; ta.hk3 += md.hk3
            ta.rawRevenue += md.rawRevenue; ta.rawGm += md.rawGm; ta.rawCc += rawCc
            map.set(m, ta)
          }
          acc(tier.monthAgg)
          acc(tier.monthAggR[reg])
        }
      })

      // c.cc dùng projected (Σ monthCost): amount giữ nguyên full, percent × projected revenue.
      // Nhất quán với Revenue/GM (đều dùng projected) → FE × futureScale ra đúng PR 3 tháng.
      const ccForSummary = totCc
      const cm1ForSummary = totGm - totCc
      const hasProjected = monthMeta.some(mr => mr.isProjected)
      // QoQ: so sánh CM1 (actual pro-rated) vs CM1 thực tế quý trước
      const prevCm1 = prevCm1Map.get(cust.code) ?? null
      const qoqPct = prevCm1 !== null && prevCm1 !== 0 ? Math.round((cm1ForSummary - prevCm1) / Math.abs(prevCm1) * 1000) / 10 : null

      tier.custList.push({
        code: cust.code, name: cust.name,
        region: reg, priceListName: cust.priceListName,
        revenue: r2(totRev), gm: r2(totGm), gmPct: pct(totGm, totRev),
        cc: r2(ccForSummary), cm1: r2(cm1ForSummary), cm1Pct: pct(cm1ForSummary, totRev),
        qoqPct, hk3Rev: r2(totHk3), hk3Pct: pct(totHk3, totRev),
        prevCm1: r2(prevCm1 ?? 0),
        monthsCost, monthSummary,
        hasProjected,
        actualRevenue: r2(totActRev), actualGm: r2(totActGm),
        actualCc: r2(totActCc), actualCm1: r2(totActGm - totActCc),
      })
    })

    // helper: dựng month rows từ 1 map agg — projected values + actual values cho tháng hiện tại
    // QoQ là metric quý-level, không có ý nghĩa per-month → các tháng không có qoqPct
    const buildMonthRows = (agg: Map<string, MAgg>) => months.map((m) => {
      const ma = agg.get(m)
      const meta = monthMeta.find(x => x.month === m)
      const isProjected = meta?.isProjected ?? false
      if (!ma || ma.revenue === 0) return { month: m, revenue: 0, gm: 0, cc: 0, cm1: 0, cm1Pct: 0, hk3Pct: 0, hasData: false, isProjected }
      const isRunning = !!(meta && !meta.isFuture && meta.elapsed > 0 && meta.elapsed < meta.dim)
      return {
        month: m, hasData: true, isProjected,
        revenue: r2(ma.revenue), gm: r2(ma.gm), cc: r2(ma.cc),
        cm1: r2(ma.cm1), cm1Pct: pct(ma.cm1, ma.revenue),
        hk3Pct: pct(ma.hk3, ma.revenue),
        ...(isRunning && {
          ...(isProjected && {
            actualRevenue: r2(ma.rawRevenue),
            actualGm: r2(ma.rawGm),
            actualCm1: r2(ma.rawGm - ma.rawCc),
          }),
          actualCc: r2(ma.rawCc),
        }),
      }
    })

    // #4 NHẤT QUÁN GROUP COST: chi phí group B2B phân bổ vào tier theo revenue-share.
    // Pro-rate tháng đang chạy (gcRatio = elapsed/dim) — nhất quán với quarterly-report route.
    const totalB2BGroupCost = monthMeta.filter(mr => !mr.isFuture).reduce((s, mr) => {
      const budget = (groupCosts as Array<{ group_name: string; month: string; amount: number }>)
        .filter(gc => gc.group_name === "B2B" && gc.month === mr.month).reduce((a, gc) => a + (gc.amount || 0), 0)
      const gcRatio = mr.elapsed > 0 && mr.elapsed < mr.dim ? mr.elapsed / mr.dim : 1
      return s + budget * gcRatio
    }, 0)
    let grandTotalRev = 0
    tierMap.forEach(t => t.custList.forEach(c => { grandTotalRev += c.revenue }))

    // helper: tổng từ 1 danh sách customer + QoQ% (PR CM1 quý này vs CM1 thực tế quý trước)
    const buildTotals = (custs: CustRow[]) => {
      const totRev = custs.reduce((s, c) => s + c.revenue, 0)
      const totGm = custs.reduce((s, c) => s + c.gm, 0)
      const groupShare = grandTotalRev > 0 ? (totRev / grandTotalRev) * totalB2BGroupCost : 0
      // totalCc = Turso per-customer costs only (KHÔNG gồm Group Cost) — nhất quán với Bảng Tổng hợp theo Tháng
      // (Bảng 1/2 hiện Ch.Cost + Group Cost tách biệt, nên Bảng 3 cũng không cộng Group vào Ch.Cost)
      const totCc = custs.reduce((s, c) => s + c.cc, 0)
      const totCm1 = custs.reduce((s, c) => s + c.cm1, 0) - groupShare  // CM1 vẫn trừ Group Cost
      const totHk3 = custs.reduce((s, c) => s + c.hk3Rev, 0)
      // QoQ: CM1 prorata Q3 (totCm1 — tháng ĐÃ XONG dùng actual, tháng hiện tại chiếu theo ngày) vs CM1 thực tế Q2.
      // Trước dùng totActCm1 × qFactor (raw × quarter-factor) → SCALE NHẦM cả tháng đã xong (Jul) → QoQ quá cao.
      const prevTotCm1 = custs.reduce((s, c) => s + (prevCm1Map.get(c.code) ?? 0), 0)
      const qoqPct = prevTotCm1 !== 0 ? Math.round((totCm1 - prevTotCm1) / Math.abs(prevTotCm1) * 1000) / 10 : null
      return {
        totalRevenue: r2(totRev), totalGm: r2(totGm), totalGmPct: pct(totGm, totRev),
        totalCc: r2(totCc), totalCm1: r2(totCm1), totalCm1Pct: pct(totCm1, totRev),
        totalHk3Pct: pct(totHk3, totRev), qoqPct,
        prevCm1: r2(prevTotCm1),  // để FE recompute QoQ với CM1 đã gồm ước tính T9 (futureScale)
      }
    }

    // Build tier output — kèm breakdown theo region VN/US
    const tiers = TIER_ORDER.map(tierName => {
      const tier = tierMap.get(tierName)!
      const custList = tier.custList.sort((a, b) => b.revenue - a.revenue)
      const vnCusts = custList.filter(c => c.region === "VN")
      const usCusts = custList.filter(c => c.region === "US")

      return {
        tier: tierName,
        ...buildTotals(custList),
        months: buildMonthRows(tier.monthAgg),
        customers: custList,
        customerCount: custList.length,
        byRegion: {
          VN: { ...buildTotals(vnCusts), months: buildMonthRows(tier.monthAggR.VN), customers: vnCusts, customerCount: vnCusts.length },
          US: { ...buildTotals(usCusts), months: buildMonthRows(tier.monthAggR.US), customers: usCusts, customerCount: usCusts.length },
        },
      }
    }).filter(t => t.totalRevenue > 0)

    return NextResponse.json({ quarter, year, months, tiers }, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[quarterly-b2b-customers]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
