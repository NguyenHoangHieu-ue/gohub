import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { queryAnalytics } from "@/lib/analytics-db"
import { analyticsGuard, CACHE_HEADERS, cachedQuery, QUERY_TTL_MIN, noCache, shipFilter, internalOpsFilter } from "@/lib/analytics-helpers"
import { fetchCosts } from "@/lib/bod-data"
import { fetchQuarterlySettings, makeClassifyTier, exclHash } from "@/lib/quarterly-settings"
import { buildQuarterMonthMeta } from "@/lib/analytics-engine/quarter-projection"

// Bản "Organization" của quarterly-b2b-customers (s200) — group theo dim_customer.organization
// (⚠️ s200+1: đã verify trực tiếp staging — organization_code 100% rỗng/dead column trên MỌI dòng
// dim_customer (355.389/355.389), field THẬT có data là `organization` (text, vd "VN_Org Vietravel",
// 909 giá trị khác nhau, 1050 KH được gắn — 313 trong số đó có phát sinh đơn B2B thật). Ban đầu chọn
// nhầm organization_code làm khoá gộp → route KHÔNG BAO GIỜ gộp được gì (luôn fallback về customer_code
// vì cột rỗng) dù `organization` đã có data thật — đây là nguyên nhân Hiếu thấy "chưa phù hợp".
// thay vì customer_code. KHÔNG tính CH.Cost per-customer (Turso) — chi phí đó gắn với customer_code lẻ,
// không có ý nghĩa gộp nhiều mã KH vào 1 tổ chức. CM1 tier-level vẫn trừ Group Cost (B2B, Supabase) —
// logic aggregation tier giống hệt quarterly-b2b-customers (không đổi công thức tier/QoQ/%MoM).
export const maxDuration = 60
export const dynamic = "force-dynamic"

const ORG_CACHE_PREFIX = "qorg_raw_v1:"

function classifyRegion(priceListName: string | null, currencyCode: string | null): string {
  const p = (priceListName || "").toUpperCase()
  const c = (currencyCode || "").toUpperCase()
  if (p.includes(" US") || p.startsWith("US ") || c === "USD") return "US"
  return "VN"
}

function getQuarterMonths(quarter: string, year: number): string[] {
  const q = parseInt(quarter.replace("Q", ""))
  const start = (q - 1) * 3 + 1
  return [0, 1, 2].map(i => `${year}-${String(start + i).padStart(2, "0")}`)
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
  const sfx = `${shipFilter(includeShip)} ${internalOpsFilter(includeInternalOps)}`

  const months = getQuarterMonths(quarter, year)
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
  const refresh = noCache(req)

  const { excludedCustomers, tierKeywords } = await fetchQuarterlySettings()
  const classifyTier = makeClassifyTier(tierKeywords)
  const exclFilter = excludedCustomers.length > 0
    ? `AND COALESCE(c.name, TRIM(f.customer_code)) NOT IN (${excludedCustomers.map(n => `'${n.replace(/'/g, "''")}'`).join(",")})`
    : ""

  const rawCacheKey = `${ORG_CACHE_PREFIX}${quarter}:${year}:${companyCode}:${todayStr}:${exclHash(excludedCustomers)}:${includeShip ? 1 : 0}:${includeInternalOps ? 1 : 0}`

  try {
    const [rows, { groupCosts }] = await Promise.all([
      cachedQuery(rawCacheKey, () => queryAnalytics<{
        month: string; customer_code: string; customer_name: string
        org_key: string; org_name: string
        price_list_name: string | null; currency_code: string | null
        revenue: string; gm: string; hk3: string
      }>(`
        SELECT
          TO_CHAR(f.fulfiled_date::date, 'YYYY-MM') as month,
          TRIM(f.customer_code) as customer_code,
          COALESCE(c.name, TRIM(f.customer_code)) as customer_name,
          COALESCE(NULLIF(TRIM(c.organization), ''), TRIM(f.customer_code)) as org_key,
          COALESCE(NULLIF(TRIM(c.organization), ''), COALESCE(c.name, TRIM(f.customer_code))) as org_name,
          c.price_list_name, c.currency_code,
          SUM(f.fulfilled_revenue_amount_vnd) as revenue,
          SUM(f.gross_profit_vnd) as gm,
          SUM(CASE WHEN sk.sku IS NOT NULL THEN f.fulfilled_revenue_amount_vnd ELSE 0 END) as hk3
        FROM fact_fulfillment_revenue f
        LEFT JOIN dim_order_source s ON f.order_source_code = s.code
        LEFT JOIN dim_customer c ON TRIM(f.customer_code) = c.code
        LEFT JOIN (
          SELECT DISTINCT TRIM(sku) as sku FROM dim_sku
          WHERE REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'
        ) sk ON TRIM(f.sku) = sk.sku
        WHERE f.fulfiled_date::date >= '${qStartDate}' AND f.fulfiled_date::date <= '${qEndDate}'
          ${companyFilter}
          AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
          AND NOT (UPPER(COALESCE(c.price_list_name, '')) LIKE '%INACTIVE%')
          ${exclFilter}
          ${sfx}
        GROUP BY 1, 2, 3, 4, 5, 6, 7
        ORDER BY 1, 4
      `), QUERY_TTL_MIN, refresh),
      fetchCosts(months).catch(() => ({ channelCosts: [], groupCosts: [] as Array<{ group_name: string; month: string; amount: number }> })),
    ])

    const monthMeta = buildQuarterMonthMeta(months, asOf, todayStr)
    const pct = (n: number, d: number) => d > 0 ? Math.round(n / d * 1000) / 10 : 0
    const r2 = Math.round

    interface OrgMonth { revenue: number; gm: number; hk3: number; rawRevenue: number; rawGm: number }
    interface OrgAgg {
      orgKey: string; orgName: string; memberCodes: Set<string>
      repRevenue: number; priceListName: string | null; currencyCode: string | null
      months: Map<string, OrgMonth>
    }
    const orgMap = new Map<string, OrgAgg>()
    // Doanh thu tổng theo customer_code (cả quý) — dùng chọn tier/region "đại diện" cho org khi org gồm
    // nhiều mã KH có bảng giá khác nhau (KHÔNG hiếm — verify s200+1: 26/909 org có ≥2 price_list_name/
    // tier khác nhau giữa các chi nhánh, vd "VN_Org Vietravel" vừa Gold vừa Silver tuỳ chi nhánh).
    const custTotalRevenue = new Map<string, number>()
    const custNameMap = new Map<string, string>()
    rows.forEach(row => {
      const rev = parseFloat(row.revenue || "0")
      custTotalRevenue.set(row.customer_code, (custTotalRevenue.get(row.customer_code) || 0) + rev)
      custNameMap.set(row.customer_code, row.customer_name)
    })

    rows.forEach(row => {
      if (row.price_list_name?.toUpperCase().includes("INACTIVE")) return
      const key = row.org_key
      let org = orgMap.get(key)
      if (!org) {
        org = { orgKey: key, orgName: row.org_name, memberCodes: new Set(), repRevenue: -1, priceListName: row.price_list_name, currencyCode: row.currency_code, months: new Map() }
        orgMap.set(key, org)
      }
      org.memberCodes.add(row.customer_code)
      const custRev = custTotalRevenue.get(row.customer_code) || 0
      if (custRev > org.repRevenue) {
        org.repRevenue = custRev
        org.priceListName = row.price_list_name
        org.currencyCode = row.currency_code
      }
      const mr = monthMeta.find(m => m.month === row.month)
      if (!mr) return
      const revAct = parseFloat(row.revenue || "0")
      const gmAct = parseFloat(row.gm || "0")
      const hk3Act = parseFloat(row.hk3 || "0")
      const existing = org.months.get(row.month)
      const factor = mr.factor
      if (existing) {
        existing.revenue += revAct * factor; existing.gm += gmAct * factor; existing.hk3 += hk3Act * factor
        existing.rawRevenue += revAct; existing.rawGm += gmAct
      } else {
        org.months.set(row.month, { revenue: revAct * factor, gm: gmAct * factor, hk3: hk3Act * factor, rawRevenue: revAct, rawGm: gmAct })
      }
    })

    const TIER_ORDER = ["Strategic", "VIP", "Gold", "Silver"]
    interface OrgMonthSummary { revenue: number; gm: number; hk3Pct: number; isProjected: boolean; actualRevenue?: number; actualGm?: number }
    interface OrgRow {
      orgKey: string; orgName: string; region: string; memberCodes: string[]; memberCount: number
      members: { code: string; name: string; revenue: number }[]
      revenue: number; gm: number; gmPct: number; hk3Rev: number; hk3Pct: number
      qoqPct: number | null
      monthSummary: Record<string, OrgMonthSummary>
    }
    type MAgg = { revenue: number; gm: number; hk3: number }
    const emptyMAgg = (): MAgg => ({ revenue: 0, gm: 0, hk3: 0 })
    const tierMap = new Map<string, { tier: string; orgList: OrgRow[]; monthAgg: Map<string, MAgg>; monthAggR: { VN: Map<string, MAgg>; US: Map<string, MAgg> } }>()
    TIER_ORDER.forEach(tier => tierMap.set(tier, { tier, orgList: [], monthAgg: new Map(), monthAggR: { VN: new Map(), US: new Map() } }))

    orgMap.forEach(org => {
      const tierName = classifyTier(org.priceListName)
      const tier = tierMap.get(tierName) ?? tierMap.get("Strategic")!
      const region: "VN" | "US" = classifyRegion(org.priceListName, org.currencyCode) === "US" ? "US" : "VN"

      let totRev = 0, totGm = 0, totHk3 = 0
      const monthSummary: Record<string, OrgMonthSummary> = {}
      months.forEach(m => {
        const md = org.months.get(m)
        const meta = monthMeta.find(x => x.month === m)
        const isProj = meta?.isProjected ?? false
        if (!md) return
        monthSummary[m] = {
          revenue: r2(md.revenue), gm: r2(md.gm), hk3Pct: pct(md.hk3, md.revenue), isProjected: isProj,
          ...(isProj && { actualRevenue: r2(md.rawRevenue), actualGm: r2(md.rawGm) }),
        }
        totRev += md.revenue; totGm += md.gm; totHk3 += md.hk3
        const acc = (map: Map<string, MAgg>) => {
          const ta = map.get(m) || emptyMAgg()
          ta.revenue += md.revenue; ta.gm += md.gm; ta.hk3 += md.hk3
          map.set(m, ta)
        }
        acc(tier.monthAgg); acc(tier.monthAggR[region])
      })

      const members = [...org.memberCodes]
        .map(code => ({ code, name: custNameMap.get(code) || code, revenue: r2(custTotalRevenue.get(code) || 0) }))
        .sort((a, b) => b.revenue - a.revenue)

      tier.orgList.push({
        orgKey: org.orgKey, orgName: org.orgName, region,
        memberCodes: [...org.memberCodes], memberCount: org.memberCodes.size, members,
        revenue: r2(totRev), gm: r2(totGm), gmPct: pct(totGm, totRev),
        hk3Rev: r2(totHk3), hk3Pct: pct(totHk3, totRev),
        qoqPct: null, // v1: không có dữ liệu quý trước theo org — để "—" ở FE, xem wiki Gotchas
        monthSummary,
      })
    })

    // Group Cost B2B — phân bổ theo revenue-share, y hệt quarterly-b2b-customers (#4 NHẤT QUÁN GROUP COST).
    const totalB2BGroupCost = monthMeta.filter(mr => !mr.isFuture).reduce((s, mr) => {
      const budget = (groupCosts as Array<{ group_name: string; month: string; amount: number }>)
        .filter(gc => gc.group_name === "B2B" && gc.month === mr.month).reduce((a, gc) => a + (gc.amount || 0), 0)
      const gcRatio = mr.elapsed > 0 && mr.elapsed < mr.dim ? mr.elapsed / mr.dim : 1
      return s + budget * gcRatio
    }, 0)
    let grandTotalRev = 0
    tierMap.forEach(t => t.orgList.forEach(o => { grandTotalRev += o.revenue }))

    const buildTotals = (orgs: OrgRow[]) => {
      const totRev = orgs.reduce((s, o) => s + o.revenue, 0)
      const totGm = orgs.reduce((s, o) => s + o.gm, 0)
      const groupShare = grandTotalRev > 0 ? (totRev / grandTotalRev) * totalB2BGroupCost : 0
      const totCm1 = totGm - groupShare
      const totHk3 = orgs.reduce((s, o) => s + o.hk3Rev, 0)
      return {
        totalRevenue: r2(totRev), totalGm: r2(totGm), totalGmPct: pct(totGm, totRev),
        totalGroupCost: r2(groupShare), totalCm1: r2(totCm1), totalCm1Pct: pct(totCm1, totRev),
        totalHk3Rev: r2(totHk3), totalHk3Pct: pct(totHk3, totRev),
      }
    }

    const buildMonthRows = (agg: Map<string, MAgg>) => months.map(m => {
      const ma = agg.get(m)
      const meta = monthMeta.find(x => x.month === m)
      const isProjected = meta?.isProjected ?? false
      if (!ma || ma.revenue === 0) return { month: m, revenue: 0, gm: 0, hk3Rev: 0, hk3Pct: 0, hasData: false, isProjected }
      return { month: m, hasData: true, isProjected, revenue: r2(ma.revenue), gm: r2(ma.gm), hk3Rev: r2(ma.hk3), hk3Pct: pct(ma.hk3, ma.revenue) }
    })

    const tiers = TIER_ORDER.map(tierName => {
      const tier = tierMap.get(tierName)!
      const orgList = tier.orgList.sort((a, b) => b.revenue - a.revenue)
      const vn = orgList.filter(o => o.region === "VN")
      const us = orgList.filter(o => o.region === "US")
      return {
        tier: tierName,
        ...buildTotals(orgList),
        months: buildMonthRows(tier.monthAgg),
        organizations: orgList, organizationCount: orgList.length,
        byRegion: {
          VN: { ...buildTotals(vn), months: buildMonthRows(tier.monthAggR.VN), organizations: vn, organizationCount: vn.length },
          US: { ...buildTotals(us), months: buildMonthRows(tier.monthAggR.US), organizations: us, organizationCount: us.length },
        },
      }
    }).filter(t => t.totalRevenue > 0)

    return NextResponse.json({ quarter, year, months, tiers }, { headers: CACHE_HEADERS })
  } catch (err: any) {
    console.error("[quarterly-org-customers]", err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
