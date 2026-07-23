import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN } from "@/lib/analytics-helpers"
import { getDaysInMonth, getDaysInRange } from "@/lib/bod-data"
import { fetchCustomerCosts, calcRecordCostProjected } from "@/lib/b2b-customer-cost"

// Tier & region classification từ dim_customer.price_list_name + currency_code
// Spec: không có Strategic/VIP/Silver/Gold thì xếp vào Strategic (default)
const EXCLUDED_CUSTOMERS = ["B2C Customer US", "B2C Customer VN", "B2B Ops"]

function classifyTier(priceListName: string | null): string {
  if (!priceListName) return "Strategic"
  const p = priceListName.toUpperCase()
  if (p.includes("STRATEGIC")) return "Strategic"
  if (p.includes("VIP")) return "VIP"
  if (p.includes("GOLD")) return "Gold"
  if (p.includes("SILVER")) return "Silver"
  return "Strategic"  // default per spec
}

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
  // Region KHÔNG còn trong key — server trả full VN+US, client tự lọc.
  void regionFilter
  const refresh = searchParams.get("refresh") === "1"  // bypass cache sau khi lưu chi phí
  // v6: fetchCustomerCosts (Turso) được gọi NGOÀI cachedQuery → luôn fresh khi user lưu chi phí.
  // Cache chỉ giữ dữ liệu gohub_dw (customerRows + priorRows) — không đổi khi lưu chi phí.
  const rawCacheKey = `qb2b_raw_v1:${quarter}:${year}:${companyCode}:${todayStr}`

  try {
    // ── Phần 1: cache gohub_dw (customerRows + priorRows) ────────────────────────
    const rawData = await cachedQuery(rawCacheKey, async () => {
      // Prior month (for MoM calculation)
      const [py, pm0] = [parseInt(months[0].split("-")[0]), parseInt(months[0].split("-")[1])]
      const priorMonth = pm0 === 1
        ? `${py - 1}-12`
        : `${py}-${String(pm0 - 1).padStart(2, "0")}`
      const priorStart = `${priorMonth}-01`
      const priorEnd = new Date(parseInt(priorMonth.split("-")[0]), parseInt(priorMonth.split("-")[1]), 0)
        .toISOString().split("T")[0]

      const excludeList = EXCLUDED_CUSTOMERS.map(n => `'${n.replace(/'/g, "''")}'`).join(",")

      // Main query: customer-level revenue breakdown by month
      const [customerRows, priorRows] = await Promise.all([
        queryAnalytics<{
          month: string; customer_code: string; customer_name: string
          price_list_name: string | null; currency_code: string | null; channel_name: string
          revenue: string; gm: string; hk3: string
        }>(`
          SELECT
            TO_CHAR(f.created_date::date, 'YYYY-MM') as month,
            TRIM(f.customer_code) as customer_code,
            COALESCE(c.name, TRIM(f.customer_code)) as customer_name,
            c.price_list_name,
            c.currency_code,
            COALESCE(TRIM(s.channel_name), '') as channel_name,
            SUM(f.fulfilled_revenue_amount_vnd) as revenue,
            SUM(f.gross_profit_vnd) as gm,
            SUM(CASE WHEN REPLACE(UPPER(TRIM(sk.vendor)),' ','') = '3HKDATAPOOL'
                THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) as hk3
          FROM fact_fulfillment_revenue f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
          LEFT JOIN dim_sku sk ON f.sku = sk.sku
          WHERE f.created_date::date >= '${qStartDate}'
            AND f.created_date::date <= '${qEndDate}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
            AND COALESCE(c.name, TRIM(f.customer_code)) NOT IN (${excludeList})
          GROUP BY 1, 2, 3, 4, 5, 6
          ORDER BY 1, 2
        `),
        // Prior month data for MoM
        queryAnalytics<{ customer_code: string; gm: string; revenue: string }>(`
          SELECT
            TRIM(f.customer_code) as customer_code,
            SUM(f.gross_profit_vnd) as gm,
            SUM(f.fulfilled_revenue_amount_vnd) as revenue
          FROM fact_fulfillment_revenue f
          LEFT JOIN dim_order_source s ON f.order_source_code = s.code
          LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code::text)
          WHERE f.created_date::date >= '${priorStart}'
            AND f.created_date::date <= '${priorEnd}'
            ${companyFilter}
            AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
            AND COALESCE(c.name, TRIM(f.customer_code)) NOT IN (${excludeList})
          GROUP BY 1
        `),
      ])

      return { customerRows, priorRows }
    }, QUERY_TTL_MIN, refresh)

    // ── Phần 2: Turso costs — luôn fresh (NGOÀI cache) ───────────────────────────
    const costMap = await fetchCustomerCosts(months)

    // ── Phần 3: Compute (pure, fast ~1ms) ────────────────────────────────────────
    const { customerRows, priorRows } = rawData

    // Prior month map for MoM
    const priorMap = new Map<string, { gm: number; revenue: number }>()
    priorRows.forEach(r => {
      priorMap.set(r.customer_code, { gm: parseFloat(r.gm || "0"), revenue: parseFloat(r.revenue || "0") })
    })

    // Month metadata (for pro-rata)
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
      return { month: m, mStart, actualEnd, isProjected, factor }
    })

    // Aggregate customer data — lưu giá trị PROJECTED + rawRevenue/rawGm (actual, để tính actual vs PR).
    interface CustMonth { revenue: number; gm: number; hk3: number; rawRevenue: number; rawGm: number; factor: number }
    interface CustomerAgg {
      code: string; name: string; priceListName: string | null; currencyCode: string | null
      tier: string; region: string
      months: Map<string, CustMonth>
    }
    const customerMap = new Map<string, CustomerAgg>()

    customerRows.forEach(row => {
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
      const gmAct  = parseFloat(row.gm   || "0")
      const hk3Act = parseFloat(row.hk3  || "0")

      const existing = cust.months.get(row.month)
      if (existing) {
        existing.revenue    += revAct * factor
        existing.gm         += gmAct  * factor
        existing.hk3        += hk3Act * factor
        existing.rawRevenue += revAct
        existing.rawGm      += gmAct
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
    interface CustRow {
      code: string; name: string; region: string; priceListName: string | null
      revenue: number; gm: number; gmPct: number; cc: number; cm1: number
      cm1Pct: number; momPct: number | null; hk3Rev: number; hk3Pct: number
      monthsCost: Record<string, CustMonthCost>
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
      const monthsCost: Record<string, CustMonthCost> = {}

      months.forEach(m => {
        const md = cust.months.get(m)
        const rec = costMap.get(`${m}_${cust.code}`)
        // amount cost: không nhân factor (người dùng nhập bao nhiêu hiện bấy nhiêu).
        // percent cost: áp dụng trên projected revenue (rawRevenue × factor).
        const monthCost = md ? calcRecordCostProjected(rec, md.rawRevenue, md.factor) : 0  // projected
        const rawCc     = md ? calcRecordCostProjected(rec, md.rawRevenue, 1) : 0           // actual (factor=1)
        monthsCost[m] = {
          cost_lines: rec?.cost_lines ?? "[]",
          cost_type:  rec?.cost_type  ?? "amount",
          cost_value: rec?.cost_value ?? 0,
          revenue:    md ? r2(md.revenue) : 0,
        }
        if (!md) return
        totRev += md.revenue
        totGm  += md.gm
        totCc  += monthCost
        totHk3 += md.hk3

        const acc = (map: Map<string, MAgg>) => {
          const ta = map.get(m) || emptyMAgg()
          ta.revenue += md.revenue; ta.gm += md.gm; ta.cc += monthCost
          ta.cm1 += md.gm - monthCost; ta.hk3 += md.hk3
          ta.rawRevenue += md.rawRevenue; ta.rawGm += md.rawGm; ta.rawCc += rawCc
          map.set(m, ta)
        }
        acc(tier.monthAgg)
        acc(tier.monthAggR[reg])
      })

      const totCm1 = totGm - totCc
      const prior = priorMap.get(cust.code)
      const priorGm = prior?.gm ?? null
      const momPct = priorGm && priorGm !== 0 ? Math.round((totGm - priorGm) / Math.abs(priorGm) * 1000) / 10 : null

      tier.custList.push({
        code: cust.code, name: cust.name,
        region: reg, priceListName: cust.priceListName,
        revenue: r2(totRev), gm: r2(totGm), gmPct: pct(totGm, totRev),
        cc: r2(totCc), cm1: r2(totCm1), cm1Pct: pct(totCm1, totRev),
        momPct,
        hk3Rev: r2(totHk3), hk3Pct: pct(totHk3, totRev),
        monthsCost,
      })
    })

    // helper: dựng month rows từ 1 map agg — projected values + actual values cho tháng hiện tại
    const buildMonthRows = (agg: Map<string, MAgg>) => months.map((m, idx) => {
      const ma = agg.get(m)
      const meta = monthMeta.find(x => x.month === m)
      const isProjected = meta?.isProjected ?? false
      if (!ma || ma.revenue === 0) return { month: m, revenue: 0, gm: 0, cc: 0, cm1: 0, cm1Pct: 0, momPct: null, hk3Pct: 0, hasData: false, isProjected }
      const prevMa = idx > 0 ? agg.get(months[idx - 1]) : null
      const momPct = prevMa && prevMa.cm1 !== 0
        ? Math.round((ma.cm1 - prevMa.cm1) / Math.abs(prevMa.cm1) * 1000) / 10
        : null
      return {
        month: m, hasData: true, isProjected,
        revenue: r2(ma.revenue), gm: r2(ma.gm), cc: r2(ma.cc),
        cm1: r2(ma.cm1), cm1Pct: pct(ma.cm1, ma.revenue),
        momPct, hk3Pct: pct(ma.hk3, ma.revenue),
        // Actual YTD (chỉ có ý nghĩa khi isProjected = true; tháng đã hoàn thành thì actual == projected)
        ...(isProjected && {
          actualRevenue: r2(ma.rawRevenue),
          actualGm: r2(ma.rawGm),
          actualCc: r2(ma.rawCc),
          actualCm1: r2(ma.rawGm - ma.rawCc),
        }),
      }
    })

    // helper: tổng từ 1 danh sách customer
    const buildTotals = (custs: CustRow[]) => {
      const totRev = custs.reduce((s, c) => s + c.revenue, 0)
      const totGm  = custs.reduce((s, c) => s + c.gm, 0)
      const totCc  = custs.reduce((s, c) => s + c.cc, 0)
      const totCm1 = custs.reduce((s, c) => s + c.cm1, 0)
      const totHk3 = custs.reduce((s, c) => s + c.hk3Rev, 0)
      return {
        totalRevenue: r2(totRev), totalGm: r2(totGm), totalGmPct: pct(totGm, totRev),
        totalCc: r2(totCc), totalCm1: r2(totCm1), totalCm1Pct: pct(totCm1, totRev),
        totalHk3Pct: pct(totHk3, totRev),
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
