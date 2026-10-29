import { rq } from "./client"
import { b2bFilterSql } from "./filters"
import { diffRows } from "./quarter"

// Bản rollup của truy vấn trong /api/analytics/b2b/tier-performance: B2B theo (bảng giá, tiền tệ). Route tự phân tier/vùng từ hai cột này.
// Số đơn cộng theo ngày nên đơn giao nhiều ngày bị đếm nhiều lần (xem plan §16).
export interface TierRow { price_list_name: string | null; currency_code: string | null; revenue: string; gp: string; orders: string; units: string }
export interface TierArgs { basis: "ful" | "sal"; start: string; end: string; companyCode: string; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }

export async function fetchTierRollup(a: TierArgs): Promise<TierRow[]> {
  const f = b2bFilterSql({ companyCode: a.companyCode, includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: true, excludedCustomers: a.excludedCustomers })
  const rows = await rq(`SELECT c.price_list_name AS price_list_name, c.currency_code AS currency_code, SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS gp, SUM(r.orders) AS orders, SUM(r.qty) AS units
    FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer
    WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${f} GROUP BY 1, 2`, [a.basis, a.start, a.end])
  const t = (v: unknown) => (v == null ? null : String(v))
  return rows.map(r => ({ price_list_name: t(r.price_list_name), currency_code: t(r.currency_code), revenue: String(Number(r.revenue ?? 0)), gp: String(Number(r.gp ?? 0)), orders: String(Number(r.orders ?? 0)), units: String(Number(r.units ?? 0)) }))
}

export function diffTier(raw: TierRow[], ru: TierRow[]) {
  const key = (r: TierRow) => `${r.price_list_name ?? ""}|${r.currency_code ?? ""}`
  const d = diffRows(raw, ru, key, ["revenue", "gp", "units"])
  const sum = (rows: TierRow[]) => rows.reduce((s, r) => s + Number(r.orders || 0), 0)
  const ro = sum(raw), uo = sum(ru), pct = ro ? Math.round(((uo - ro) / ro) * 1000) / 10 : 0
  return { ok: d.ok && Math.abs(pct) <= 1, rows: d, orders: { raw: ro, rollup: uo, pct } }
}
