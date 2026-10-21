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
export interface OrgRow {
  orgKey: string; orgName: string; customers: number
  revenue: number; cogs: number; margin: number; units: number; orders: number
  marginPct: number; cm1: number; cm1Pct: number
}
export interface TierRow extends Omit<OrgRow, "orgKey" | "orgName" | "customers"> { tier: string; orgs: OrgRow[] }

const TIER_ORDER = ["Strategic", "VIP", "Gold", "Silver"]

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
             c.price_list_name,
             SUM(f.${source.revenueCol}) as revenue, SUM(f.${source.cogsCol}) as cogs, SUM(f.${source.marginCol}) as margin,
             SUM(f.${source.quantityCol}) as units, COUNT(DISTINCT f.order_code) as orders
      FROM ${source.mainTable} f
      LEFT JOIN dim_order_source s ON f.order_source_code = s.code
      LEFT JOIN dim_customer c ON TRIM(f.customer_code) = c.code
      WHERE ${filter} ${extraFilters} ${sfx} AND UPPER(COALESCE(s.group_name, '')) = 'B2B'
      GROUP BY 1, 2, 3, 4, 5`),
    fetchCosts(months),
    fetchCustomerCosts(months),
  ])

  type Acc = { tier: string; orgKey: string; orgName: string; customers: Set<string>; revenue: number; cogs: number; margin: number; units: number; orders: number }
  const orgs = new Map<string, Acc>()
  const custRev: { customer_code: string; month: string; key: string; revenue: number }[] = []
  for (const r of rows) {
    const tier = classifyTier(r.price_list_name)
    const key = `${tier}||${r.org_key}`
    const a = orgs.get(key) ?? { tier, orgKey: r.org_key, orgName: r.org_name, customers: new Set<string>(), revenue: 0, cogs: 0, margin: 0, units: 0, orders: 0 }
    const rev = parseFloat(r.revenue || "0")
    a.customers.add(r.customer_code); a.revenue += rev; a.cogs += parseFloat(r.cogs || "0"); a.margin += parseFloat(r.margin || "0")
    a.units += parseFloat(r.units || "0"); a.orders += parseInt(r.orders || "0")
    orgs.set(key, a)
    custRev.push({ customer_code: r.customer_code, month: r.month, key, revenue: rev })
  }
  const custCost = allocateCustomerCostByKey(custRev, costMap, startDate, endDate)
  const totalRev = [...orgs.values()].reduce((s, a) => s + a.revenue, 0)
  const groupPool = groupCosts.filter((c: any) => c.group_name === "B2B").reduce((s: number, c: any) => s + c.amount * rangeDayRatio(startDate, endDate, c.month), 0)

  const toOrg = (key: string, a: Acc): OrgRow => {
    const cm1 = a.margin - (custCost.get(key) || 0) - (totalRev > 0 ? groupPool * a.revenue / totalRev : 0)
    return { orgKey: a.orgKey, orgName: a.orgName, customers: a.customers.size, revenue: a.revenue, cogs: a.cogs, margin: a.margin, units: a.units, orders: a.orders,
      marginPct: a.revenue > 0 ? a.margin / a.revenue * 100 : 0, cm1, cm1Pct: a.revenue > 0 ? cm1 / a.revenue * 100 : 0 }
  }
  const byTier = new Map<string, OrgRow[]>()
  orgs.forEach((a, key) => { const l = byTier.get(a.tier) ?? []; l.push(toOrg(key, a)); byTier.set(a.tier, l) })
  const tierNames = [...new Set([...TIER_ORDER, ...byTier.keys()])].filter(t => byTier.has(t))
  return tierNames.map(tier => {
    const list = (byTier.get(tier) ?? []).sort((x, y) => y.revenue - x.revenue)
    const sum = (f: (o: OrgRow) => number) => list.reduce((s, o) => s + f(o), 0)
    const revenue = sum(o => o.revenue), margin = sum(o => o.margin), cm1 = sum(o => o.cm1)
    return { tier, orgs: list, revenue, cogs: sum(o => o.cogs), margin, units: sum(o => o.units), orders: sum(o => o.orders),
      marginPct: revenue > 0 ? margin / revenue * 100 : 0, cm1, cm1Pct: revenue > 0 ? cm1 / revenue * 100 : 0 }
  })
}
