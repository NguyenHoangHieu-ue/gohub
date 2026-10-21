import { queryAnalytics } from "@/lib/analytics-db"
import { getAnalyticsSource, getDateFilter, shipFilter, internalOpsFilterByCode, excludeInactiveCustomers } from "@/lib/analytics-helpers"
import { fetchQuarterlySettings, makeClassifyTier, makeExcludeSqlByCode } from "@/lib/quarterly-settings"
import { fetchCustomerCosts } from "@/lib/b2b-customer-cost"
import { allocateCustomerCostByKey } from "@/lib/analytics-engine/customer-cost-allocation"
import { rangeDayRatio } from "@/lib/analytics-engine/cost-engine"
import { fetchCosts, monthsBetween } from "@/lib/bod-data"

// Bảng "Channel Performance Breakdown" của BOD cho B2B: theo TIER (Strategic, VIP, Gold, Silver — phân loại theo bảng giá khách, cùng
// `classifyTier` với Quarter Report) rồi ORGANIZATION (dim_customer.organization, gộp các mã khách cùng tổ chức). Thay cách cũ dùng
// config partner_tiers (đã trống) nên "Strategic" luôn rỗng.
// CM1 = GP − chi phí khách (Turso, theo KHÁCH THẬT) − chi phí nhóm B2B chia theo tỷ trọng doanh thu (cùng cách bảng kênh/BOD tổng).
export interface CustRow {
  code: string; name: string
  revenue: number; cogs: number; margin: number; units: number; orders: number
  marginPct: number; cm1: number; cm1Pct: number
}
export interface OrgRow extends CustRow {
  orgKey: string; orgName: string; customers: number
  /** Các mã con (chỉ có khi tổ chức có từ 2 mã trở lên), xếp theo doanh thu. */
  children: CustRow[]
}
export interface TierRow extends Omit<CustRow, "code" | "name"> { tier: string; orgs: OrgRow[] }

const TIER_ORDER = ["Strategic", "VIP", "Gold", "Silver"]
// Tên tổ chức trong gohub_dw có tiền tố pháp nhân ("VN_Org ...", "US_Org ..."); Quarter Report bỏ tiền tố này, BOD làm giống.
const cleanOrg = (n: string) => n.replace(/^(VN|US)_Org\s+/i, "")

export async function fetchBODB2BTiers(startDate: string, endDate: string, dateColumn: string, extraFilters: string, includeShip: boolean, includeInternalOps: boolean): Promise<TierRow[]> {
  const source = getAnalyticsSource(dateColumn)
  const { excludedCustomers, tierKeywords } = await fetchQuarterlySettings()
  const classifyTier = makeClassifyTier(tierKeywords)
  const filter = getDateFilter(startDate, endDate, source.dateCol)
  const sfx = `${shipFilter(includeShip)} ${internalOpsFilterByCode(includeInternalOps)} ${excludeInactiveCustomers()} ${makeExcludeSqlByCode(excludedCustomers)}`
  const months = monthsBetween(startDate, endDate)

  const [rows, { groupCosts }, costMap] = await Promise.all([
    queryAnalytics<Record<string, string>>(`
      SELECT TRIM(f.customer_code) as customer_code, TO_CHAR(f.${source.dateCol}::date, 'YYYY-MM') as month,
             COALESCE(NULLIF(TRIM(c.organization), ''), TRIM(f.customer_code)) as org_key,
             COALESCE(NULLIF(TRIM(c.organization), ''), COALESCE(c.name, TRIM(f.customer_code))) as org_name,
             c.price_list_name, COALESCE(c.name, TRIM(f.customer_code)) as cust_name,
             SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.cogsCol}) as cogs, SUM(f.${source.marginCol}) as margin,
             SUM(f.${source.quantityCol}) as units, COUNT(DISTINCT f.order_code) as orders
      FROM ${source.mainTable} f
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN dim_customer c ON TRIM(f.customer_code) = c.code
      WHERE ${filter} ${extraFilters} ${sfx} AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
      GROUP BY 1, 2, 3, 4, 5, 6`),
    fetchCosts(months),
    fetchCustomerCosts(months),
  ])

  type CAcc = { name: string; revenue: number; cogs: number; margin: number; units: number; orders: number }
  type Acc = { tier: string; orgKey: string; orgName: string; custs: Map<string, CAcc> }
  const orgs = new Map<string, Acc>()
  const custRev: { customer_code: string; month: string; key: string; revenue: number }[] = []
  for (const r of rows) {
    const tier = classifyTier(r.price_list_name)
    const okey = `${tier}||${r.org_key}`
    const a = orgs.get(okey) ?? { tier, orgKey: r.org_key, orgName: r.org_name, custs: new Map<string, CAcc>() }
    const c = a.custs.get(r.customer_code) ?? { name: r.cust_name || r.customer_code, revenue: 0, cogs: 0, margin: 0, units: 0, orders: 0 }
    const rev = parseFloat(r.revenue || "0")
    c.revenue += rev; c.cogs += parseFloat(r.cogs || "0"); c.margin += parseFloat(r.margin || "0")
    c.units += parseFloat(r.units || "0"); c.orders += parseInt(r.orders || "0")
    a.custs.set(r.customer_code, c); orgs.set(okey, a)
    custRev.push({ customer_code: r.customer_code, month: r.month, key: `${okey}||${r.customer_code}`, revenue: rev })
  }
  const custCost = allocateCustomerCostByKey(custRev, costMap, startDate, endDate)
  const totalRev = [...orgs.values()].reduce((s, a) => s + [...a.custs.values()].reduce((x, c) => x + c.revenue, 0), 0)
  const groupPool = groupCosts.filter((c: any) => c.group_name === "B2B").reduce((s: number, c: any) => s + c.amount * rangeDayRatio(startDate, endDate, c.month), 0)

  const mk = (code: string, name: string, c: CAcc, costKey: string): CustRow => {
    const cm1 = c.margin - (custCost.get(costKey) || 0) - (totalRev > 0 ? groupPool * c.revenue / totalRev : 0)
    return { code, name, revenue: c.revenue, cogs: c.cogs, margin: c.margin, units: c.units, orders: c.orders,
      marginPct: c.revenue > 0 ? c.margin / c.revenue * 100 : 0, cm1, cm1Pct: c.revenue > 0 ? cm1 / c.revenue * 100 : 0 }
  }
  const toOrg = (okey: string, a: Acc): OrgRow => {
    const kids = [...a.custs.entries()].map(([code, c]) => mk(code, cleanOrg(c.name), c, `${okey}||${code}`)).sort((x, y) => y.revenue - x.revenue)
    const sum = (f: (k: CustRow) => number) => kids.reduce((s, k) => s + f(k), 0)
    const revenue = sum(k => k.revenue), margin = sum(k => k.margin), cm1 = sum(k => k.cm1)
    return { code: a.orgKey, name: cleanOrg(a.orgName), orgKey: a.orgKey, orgName: cleanOrg(a.orgName), customers: kids.length,
      revenue, cogs: sum(k => k.cogs), margin, units: sum(k => k.units), orders: sum(k => k.orders),
      marginPct: revenue > 0 ? margin / revenue * 100 : 0, cm1, cm1Pct: revenue > 0 ? cm1 / revenue * 100 : 0,
      children: kids.length > 1 ? kids : [] }
  }
  const byTier = new Map<string, OrgRow[]>()
  orgs.forEach((a, okey) => { const l = byTier.get(a.tier) ?? []; l.push(toOrg(okey, a)); byTier.set(a.tier, l) })
  const tierNames = [...new Set([...TIER_ORDER, ...byTier.keys()])].filter(t => byTier.has(t))
  return tierNames.map(tier => {
    const list = (byTier.get(tier) ?? []).sort((x, y) => y.revenue - x.revenue)
    const sum = (f: (o: OrgRow) => number) => list.reduce((s, o) => s + f(o), 0)
    const revenue = sum(o => o.revenue), margin = sum(o => o.margin), cm1 = sum(o => o.cm1)
    return { tier, orgs: list, revenue, cogs: sum(o => o.cogs), margin, units: sum(o => o.units), orders: sum(o => o.orders),
      marginPct: revenue > 0 ? margin / revenue * 100 : 0, cm1, cm1Pct: revenue > 0 ? cm1 / revenue * 100 : 0 }
  })
}
