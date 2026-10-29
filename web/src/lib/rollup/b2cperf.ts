import { rq } from "./client"
import { b2bFilterSql } from "./filters"
import { diffRows } from "./quarter"
import type { PerfRow } from "./b2bperf"

// Bản rollup của truy vấn trong /api/analytics/b2c/performance (groupBy=channel | customer, không bộ lọc nâng cao): B2C theo kênh hoặc khách × tháng.
// Đường thô nhóm khách theo TÊN (không theo mã) và thêm cột thị trường (company_code); kênh lấy MIN(order_source_code).
export interface B2cArgs { groupBy: "channel" | "customer"; basis: "ful" | "sal"; start: string; end: string; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }

const collator = new Intl.Collator("en")
const minText = (a: string | null, b: string | null) => (a == null ? b : b == null ? a : collator.compare(a, b) <= 0 ? a : b)
const nstr = (v: unknown) => String(Number(v ?? 0))

export async function fetchB2cPerfRollup(a: B2cArgs): Promise<PerfRow[]> {
  const f = b2bFilterSql({ includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: false, excludedCustomers: a.excludedCustomers })
  const cust = a.groupBy === "customer"
  const nameExpr = cust ? "COALESCE(c.name, NULLIF(r.customer, ''), 'Unknown')" : "TRIM(s.channel_name)"
  const rows = await rq(`SELECT ${nameExpr} AS name, ${cust ? "CASE WHEN r.company = '' THEN 'NA' ELSE r.company END AS market," : ""} substr(r.day, 1, 7) AS month, r.source AS source_code,
      SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS margin, SUM(r.qty) AS units
    FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer
    WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2C'${f}
    GROUP BY 1, 2, 3${cust ? ", 4" : ""}`, [a.basis, a.start, a.end])
  const out = new Map<string, PerfRow & { _src: string | null }>()
  for (const r of rows) {
    const key = `${r.name}\u0001${cust ? r.market : ""}\u0001${r.month}`
    let o = out.get(key)
    if (!o) { o = { name: r.name == null ? (null as unknown as string) : String(r.name), ...(cust ? { market: String(r.market) } : {}), month: String(r.month), revenue: "0", margin: "0", units: "0", _src: null } as never; out.set(key, o) }
    o.revenue = nstr(Number(o.revenue) + Number(r.revenue ?? 0)); o.margin = nstr(Number(o.margin) + Number(r.margin ?? 0)); o.units = nstr(Number(o.units) + Number(r.units ?? 0))
    o._src = minText(o._src, r.source_code == null ? null : String(r.source_code))
  }
  return [...out.values()].map(({ _src, ...o }) => (cust ? o : { ...o, source_code: _src as string }))
}

export function diffB2cPerf(raw: PerfRow[], ru: PerfRow[]) {
  const key = (r: PerfRow) => `${r.name ?? ""}|${r.market ?? ""}|${r.month}`
  const d = diffRows(raw, ru, key, ["revenue", "margin", "units"])
  const b = new Map(ru.map(r => [key(r), r] as const))
  let srcMismatch = 0
  for (const r of raw) { const o = b.get(key(r)); if (o && (r.source_code ?? "") !== (o.source_code ?? "")) srcMismatch++ }
  return { ok: d.ok && !srcMismatch, rows: d, srcMismatch }
}
