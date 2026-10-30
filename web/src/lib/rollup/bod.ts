import { rq } from "./client"
import { custFilterSql } from "./filters"
import { diffRows } from "./quarter"
import type { PerfRow } from "./b2bperf"

// Rollup cho khối fact của fetchBODGroupMarginMulti (BOD summary / group-margin): theo kỳ × nhóm (Strategic/Non-Strategic/B2C/…) × kênh, và doanh thu B2B theo khách × tháng.
// Nhóm lấy từ CASE theo bảng giá khách (getCustomerStrategicSql) — viết cho Postgres nhưng dùng được trên SQLite sau khi đổi alias `f.customer_code` → `r.customer`.
export interface BodPeriodRu { start: string; end: string }
export interface BodMultiArgs { basis: "ful" | "sal"; periods: BodPeriodRu[]; groupCaseSql: string; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }
export interface BodMultiFact { rows: PerfRow[]; custRevRows: PerfRow[] }

const FROM = "FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer"
/** Đổi tham chiếu cột fact của Postgres sang cột rollup. */
export const toRollupCase = (sql: string) => sql.replace(/TRIM\(f\.customer_code\)/g, "r.customer").replace(/f\.customer_code/g, "r.customer")
const nstr = (v: unknown) => String(Number(v ?? 0))

export async function fetchBodMultiRollup(a: BodMultiArgs): Promise<BodMultiFact> {
  const f = custFilterSql({ includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: true, excludedCustomers: a.excludedCustomers })
  const grp = toRollupCase(a.groupCaseSql)
  const per = await Promise.all(a.periods.map(async (p, i) => {
    const [rows, cust] = await Promise.all([
      rq(`SELECT ${grp} AS "group", TRIM(s.channel_name) AS channel, SUM(r.revenue_vnd) AS revenue, SUM(r.cogs_vnd) AS cogs, SUM(r.gp_vnd) AS margin, SUM(r.qty) AS units, SUM(r.orders) AS orders
        ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${f} GROUP BY 1, 2`, [a.basis, p.start, p.end]),
      rq(`SELECT ${grp} AS "group", r.customer AS customer_code, substr(r.day, 1, 7) AS month, SUM(r.revenue_vnd) AS revenue
        ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${f} AND ${grp} IN ('B2B-Strategic', 'B2B-Non-Strategic') GROUP BY 1, 2, 3`, [a.basis, p.start, p.end]),
    ])
    return { i, rows, cust }
  }))
  const t = (v: unknown) => (v == null ? (null as unknown as string) : String(v))
  return {
    rows: per.flatMap(({ i, rows }) => rows.map(r => ({ period: String(i), group: t(r.group), channel: t(r.channel), revenue: nstr(r.revenue), cogs: nstr(r.cogs), margin: nstr(r.margin), units: nstr(r.units), orders: nstr(r.orders) }))),
    custRevRows: per.flatMap(({ i, cust }) => cust.map(r => ({ period: String(i), group: t(r.group), customer_code: String(r.customer_code ?? ""), month: String(r.month), revenue: nstr(r.revenue) }))),
  }
}

export function diffBodMulti(raw: BodMultiFact, ru: BodMultiFact) {
  const rows = diffRows(raw.rows, ru.rows, r => `${r.period}|${r.group ?? ""}|${r.channel ?? ""}`, ["revenue", "cogs", "margin", "units"])
  const cust = diffRows(raw.custRevRows, ru.custRevRows, r => `${r.period}|${r.group ?? ""}|${r.customer_code}|${r.month}`, ["revenue"])
  const so = (x: PerfRow[]) => x.reduce((s, r) => s + Number(r.orders || 0), 0)
  const ro = so(raw.rows), uo = so(ru.rows), pct = ro ? Math.round(((uo - ro) / ro) * 1000) / 10 : 0
  return { ok: rows.ok && cust.ok && Math.abs(pct) <= 1, rows, cust, orders: { raw: ro, rollup: uo, pct } }
}

// ── bod-summary: giá vốn/số lượng của kỳ hiện tại + doanh thu 3HK của từng kỳ ──
export interface BodAggArgs { basis: "ful" | "sal"; periods: BodPeriodRu[]; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }
export async function fetchBodAggRollup(a: BodAggArgs): Promise<PerfRow[]> {
  const f = custFilterSql({ includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: true, excludedCustomers: a.excludedCustomers })
  const inP = (i: number) => `(r.day >= ? AND r.day <= ?)`
  const cols = [`SUM(CASE WHEN ${inP(0)} THEN r.cogs_vnd ELSE 0 END) AS total_cogs`, `SUM(CASE WHEN ${inP(0)} THEN r.qty ELSE 0 END) AS total_units`,
    ...a.periods.map((_, i) => `SUM(CASE WHEN ${inP(i)} THEN r.hk3_rev_vnd ELSE 0 END) AS hk3_${i}`)].join(", ")
  const args: (string | number)[] = [a.periods[0].start, a.periods[0].end, a.periods[0].start, a.periods[0].end, ...a.periods.flatMap(p => [p.start, p.end])]
  const lo = a.periods.reduce((m, p) => (p.start < m ? p.start : m), a.periods[0].start), hi = a.periods.reduce((m, p) => (p.end > m ? p.end : m), a.periods[0].end)
  const rows = await rq(`SELECT ${cols} ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${f}`, [...args, a.basis, lo, hi])
  return rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, nstr(v)])) as PerfRow)
}
export function diffBodAgg(raw: PerfRow[], ru: PerfRow[]) {
  const bad: string[] = []
  const m = raw[0] ?? {}, o = ru[0] ?? {}
  for (const k of new Set([...Object.keys(m), ...Object.keys(o)])) {
    const x = Number(m[k] ?? 0), y = Number(o[k] ?? 0)
    if (Math.abs(x - y) > Math.max(0.5, Math.abs(x) * 1e-9)) bad.push(`${k}: thô ${x} ≠ rollup ${y}`)
  }
  return { ok: !bad.length, bad }
}
