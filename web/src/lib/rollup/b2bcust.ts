import { rq } from "./client"
import { b2bFilterSql } from "./filters"
import { diffRows } from "./quarter"

// Bản rollup của 3 truy vấn trong /api/analytics/quarterly-b2b-customers (hình dạng giống đường thô).
export interface B2bCustomerRow { month: string; customer_code: string; customer_name: string; price_list_name: string | null; currency_code: string | null; channel_name: string; org_key: string; org_name: string; revenue: string; gm: string; hk3: string }
export interface B2bPrevQuarterRow { customer_code: string; gm: string; revenue: string }
export interface B2bPrevMonthRow { customer_code: string; price_list_name: string | null; currency_code: string | null; revenue: string }
export interface B2bCustArgs { companyCode: string; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[]; qStartDate: string; qEndDate: string; prevQStartDate: string; prevQEndDate: string; monthBeforeQStartStart: string; monthBeforeQStartEnd: string }
export interface B2bTriple { customerRows: B2bCustomerRow[]; prevQuarterRows: B2bPrevQuarterRow[]; prevMonthRows: B2bPrevMonthRow[] }

const n = (v: unknown) => String(Number(v ?? 0))
const s = (v: unknown) => (v == null ? null : String(v))
// Đường thô ORDER BY tháng, mã khách theo collation của Postgres (không phân biệt hoa thường trước, chữ thường đứng trước chữ hoa khi bằng nhau); SQLite so nhị phân (chữ hoa trước).
// Route dựng danh sách theo thứ tự hàng vào nên các dòng hoà nhau phải ra cùng thứ tự → sắp lại bằng Intl.Collator.
const collator = new Intl.Collator("en")
const FROM = "FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer"

export async function fetchB2bCustomersRollup(a: B2bCustArgs): Promise<B2bTriple> {
  const base = { companyCode: a.companyCode, includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, excludedCustomers: a.excludedCustomers }
  const withInactive = b2bFilterSql({ ...base, inactive: true }), noInactive = b2bFilterSql({ ...base, inactive: false })
  const [cur, prevQ, prevM] = await Promise.all([
    rq(`SELECT substr(r.day, 1, 7) AS month, r.customer AS customer_code, COALESCE(c.name, r.customer) AS customer_name, c.price_list_name AS price_list_name, c.currency_code AS currency_code,
        COALESCE(TRIM(s.channel_name), '') AS channel_name, COALESCE(NULLIF(TRIM(c.organization), ''), r.customer) AS org_key,
        COALESCE(NULLIF(TRIM(c.organization), ''), COALESCE(c.name, r.customer)) AS org_name,
        SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS gm, SUM(r.hk3_rev_vnd) AS hk3
        ${FROM} WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${withInactive}
        GROUP BY 1, 2, 3, 4, 5, 6, 7, 8 ORDER BY 1, 2`, [a.qStartDate, a.qEndDate]),
    rq(`SELECT r.customer AS customer_code, SUM(r.gp_vnd) AS gm, SUM(r.revenue_vnd) AS revenue
        ${FROM} WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${noInactive} GROUP BY 1`, [a.prevQStartDate, a.prevQEndDate]),
    rq(`SELECT r.customer AS customer_code, c.price_list_name AS price_list_name, c.currency_code AS currency_code, SUM(r.revenue_vnd) AS revenue
        ${FROM} WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${withInactive} GROUP BY 1, 2, 3`, [a.monthBeforeQStartStart, a.monthBeforeQStartEnd]),
  ])
  return {
    customerRows: [...cur].sort((x, y) => String(x.month).localeCompare(String(y.month)) || collator.compare(String(x.customer_code), String(y.customer_code))).map(r => ({ month: String(r.month), customer_code: String(r.customer_code), customer_name: String(r.customer_name), price_list_name: s(r.price_list_name), currency_code: s(r.currency_code), channel_name: String(r.channel_name), org_key: String(r.org_key), org_name: String(r.org_name), revenue: n(r.revenue), gm: n(r.gm), hk3: n(r.hk3) })),
    prevQuarterRows: prevQ.map(r => ({ customer_code: String(r.customer_code), gm: n(r.gm), revenue: n(r.revenue) })),
    prevMonthRows: prevM.map(r => ({ customer_code: String(r.customer_code), price_list_name: s(r.price_list_name), currency_code: s(r.currency_code), revenue: n(r.revenue) })),
  }
}

export function diffB2bCustomers(raw: B2bTriple, ru: B2bTriple) {
  const cur = diffRows(raw.customerRows, ru.customerRows, r => `${r.month}|${r.customer_code}|${r.price_list_name ?? ""}|${r.currency_code ?? ""}|${r.channel_name}|${r.org_key}`, ["revenue", "gm", "hk3"])
  const pq = diffRows(raw.prevQuarterRows, ru.prevQuarterRows, r => r.customer_code, ["revenue", "gm"])
  const pm = diffRows(raw.prevMonthRows, ru.prevMonthRows, r => `${r.customer_code}|${r.price_list_name ?? ""}|${r.currency_code ?? ""}`, ["revenue"])
  return { ok: cur.ok && pq.ok && pm.ok, cur, pq, pm }
}
