import { rq } from "./client"
import { custFilterSql } from "./filters"
import { diffRows } from "./quarter"

// Bản rollup của truy vấn doanh thu B2B theo khách × tháng trong /api/analytics/quarterly-customer-lifecycle (cùng bộ lọc với Quarter Report).
export interface LifeRevRow { month: string; customer_code: string; revenue: string }
export interface LifeRevArgs { companyCode: string; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[]; start: string; end: string }

export async function fetchLifeRevRollup(a: LifeRevArgs): Promise<LifeRevRow[]> {
  const f = custFilterSql({ companyCode: a.companyCode, includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: true, excludedCustomers: a.excludedCustomers })
  const rows = await rq(`SELECT substr(r.day, 1, 7) AS month, r.customer AS customer_code, SUM(r.revenue_vnd) AS revenue
    FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source
    WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B'${f} GROUP BY 1, 2`, [a.start, a.end])
  return rows.map(r => ({ month: String(r.month), customer_code: String(r.customer_code), revenue: String(Number(r.revenue ?? 0)) }))
}
export const diffLifeRev = (raw: LifeRevRow[], ru: LifeRevRow[]) => diffRows(raw, ru, r => `${r.month}|${r.customer_code}`, ["revenue"])
