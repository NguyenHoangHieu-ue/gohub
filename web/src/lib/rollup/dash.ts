import { rq } from "./client"
import { custFilterSql } from "./filters"
import { diffRows } from "./quarter"
import { rollupFirstDay, type PerfRow } from "./b2bperf"
import { prevRange } from "./b2bkpis"
import { groupCaseFromList } from "./bod2"
import { toRollupCase } from "./bod"
import type { RollupCtx } from "./serve"

// Rollup cho các route Dashboard (kpis, performance-channel, performance-source, revenue-chart): đường thô KHÔNG lọc ship/đơn nội bộ/INACTIVE, chỉ lọc công ty.
// Số đơn cộng theo ngày nên xấp xỉ (plan §16).
export interface DashRange { start: string; end: string; prevStart: string; prevEnd: string }
const FROM = "FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer"
const co = (companyCode: string) => (companyCode && companyCode !== "ALL" ? ` AND r.company = '${companyCode.replace(/'/g, "''")}'` : "")
const nstr = (v: unknown) => String(Number(v ?? 0))
const t = (v: unknown) => (v == null ? (null as unknown as string) : String(v))
const ordersPct = (raw: PerfRow[], ru: PerfRow[], key: string) => { const so = (x: PerfRow[]) => x.reduce((s, r) => s + Number(r[key] || 0), 0); const p = so(raw), q = so(ru); return { raw: p, rollup: q, pct: p ? Math.round(((q - p) / p) * 1000) / 10 : 0 } }

/** Khoảng dùng được cho rollup (kẹp tới hôm qua; kỳ trước lùi như getPrevDateFilter), hoặc null → đường thô. */
export async function dashRange(ctx: RollupCtx, basis: "ful" | "sal", start: string | null, end: string | null, needPrev: boolean): Promise<DashRange | null> {
  const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (ctx.mode === "off" || !isDay(start) || !isDay(end)) return null
  const first = await rollupFirstDay(basis).catch(() => null)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const e = end < yesterday ? end : yesterday
  const p = needPrev ? prevRange(start, end, "none") : { start, end }
  return first && start >= first && p.start >= first && start <= e && p.start <= p.end ? { start, end: e, prevStart: p.start, prevEnd: p.end } : null
}

// ── kpis ──
export type KpiPair = [PerfRow[], PerfRow[]]
export async function fetchDashKpisRollup(basis: "ful" | "sal", r: DashRange, companyCode: string): Promise<KpiPair> {
  const q = (s: string, e: string) => rq(`SELECT SUM(r.revenue_vnd) AS revenue, SUM(r.orders) AS orders, SUM(r.qty) AS units FROM ru_cust_day r WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${co(companyCode)}`, [basis, s, e])
  const [c, p] = await Promise.all([q(r.start, r.end), q(r.prevStart, r.prevEnd)])
  const m = (rows: Record<string, unknown>[]): PerfRow[] => rows.map(x => ({ revenue: nstr(x.revenue), orders: nstr(x.orders), units: nstr(x.units) }))
  return [m(c), m(p)]
}
export function diffDashKpis(raw: KpiPair, ru: KpiPair) {
  const bad: string[] = []
  raw.forEach((rr, i) => {
    const a = rr[0] ?? {}, b = ru[i][0] ?? {}
    for (const k of ["revenue", "units"]) { const x = Number(a[k] ?? 0), y = Number(b[k] ?? 0); if (Math.abs(x - y) > Math.max(0.5, Math.abs(x) * 1e-9)) bad.push(`${i ? "prv" : "cur"}.${k}: thô ${x} ≠ rollup ${y}`) }
    const x = Number(a.orders ?? 0), y = Number(b.orders ?? 0), pct = x ? Math.round(((y - x) / x) * 1000) / 10 : 0
    if (Math.abs(pct) > 1) bad.push(`${i ? "prv" : "cur"}.orders: thô ${x} ≠ rollup ${y} (${pct}%)`)
  })
  return { ok: !bad.length, bad }
}

// ── performance-channel / performance-source ──
export async function fetchDashChannelRollup(basis: "ful" | "sal", r: DashRange, companyCode: string, strategicList: string): Promise<PerfRow[]> {
  const g = groupCaseFromList(strategicList)
  const [cur, prv] = await Promise.all([
    rq(`SELECT COALESCE(s.channel_name, 'Unknown') AS channel_name, ${g} AS business_group, SUM(r.orders) AS totalorder, SUM(r.qty) AS unitsold, SUM(r.revenue_vnd) AS grossrevenue
      ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${co(companyCode)} GROUP BY 1, 2`, [basis, r.start, r.end]),
    rq(`SELECT COALESCE(s.channel_name, 'Unknown') AS channel_name, SUM(r.revenue_vnd) AS grossrevenue ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${co(companyCode)} GROUP BY 1`, [basis, r.prevStart, r.prevEnd]),
  ])
  const pm = new Map(prv.map(x => [String(x.channel_name), Number(x.grossrevenue ?? 0)] as const))
  const rank = (b: string) => (b.startsWith("B2B") ? 1 : b === "B2C" ? 2 : 3)
  return cur.map(x => {
    const rev = Number(x.grossrevenue ?? 0), p = pm.get(String(x.channel_name)) ?? 0
    return { group: String(x.channel_name), business_group: String(x.business_group), totalorder: nstr(x.totalorder), unitsold: nstr(x.unitsold), grossrevenue: String(rev), mom: String(p === 0 ? 0 : ((rev - p) / p) * 100) }
  }).sort((a, b) => rank(a.business_group) - rank(b.business_group) || Number(b.grossrevenue) - Number(a.grossrevenue))
}
export function diffDashChannel(raw: PerfRow[], ru: PerfRow[]) {
  const d = diffRows(raw, ru, x => `${x.group}|${x.business_group}`, ["grossrevenue", "unitsold", "mom"])
  const o = ordersPct(raw, ru, "totalorder")
  return { ok: d.ok && Math.abs(o.pct) <= 1, rows: d, orders: o }
}
export async function fetchDashSourceRollup(basis: "ful" | "sal", r: DashRange, companyCode: string, strategicList: string): Promise<PerfRow[]> {
  const g = groupCaseFromList(strategicList)
  const [cur, prv] = await Promise.all([
    rq(`SELECT ${g} AS "group", SUM(r.orders) AS totalorder, SUM(r.qty) AS unitsold, SUM(r.revenue_vnd) AS grossrevenue ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${co(companyCode)} GROUP BY 1`, [basis, r.start, r.end]),
    rq(`SELECT ${g} AS "group", SUM(r.revenue_vnd) AS grossrevenue ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${co(companyCode)} GROUP BY 1`, [basis, r.prevStart, r.prevEnd]),
  ])
  const pm = new Map(prv.map(x => [String(x.group), Number(x.grossrevenue ?? 0)] as const))
  return cur.map(x => {
    const rev = Number(x.grossrevenue ?? 0), p = pm.get(String(x.group)) ?? 0
    return { group: String(x.group), totalorder: nstr(x.totalorder), unitsold: nstr(x.unitsold), grossrevenue: String(rev), mom: String(p === 0 ? 0 : ((rev - p) / p) * 100) }
  }).sort((a, b) => Number(b.grossrevenue) - Number(a.grossrevenue))
}
export function diffDashSource(raw: PerfRow[], ru: PerfRow[]) {
  const d = diffRows(raw, ru, x => x.group, ["grossrevenue", "unitsold", "mom"])
  const o = ordersPct(raw, ru, "totalorder")
  return { ok: d.ok && Math.abs(o.pct) <= 1, rows: d, orders: o }
}

// ── revenue-chart ──
export async function fetchRevenueChartRollup(basis: "ful" | "sal", start: string, end: string, companyCode: string, includeShip: boolean, includeInternalOps: boolean, isStrategicSql: string, excludedSql: string): Promise<PerfRow[]> {
  const flt = custFilterSql({ companyCode, includeShip, includeInternalOps, inactive: false })
  const strat = toRollupCase(isStrategicSql), excl = toRollupCase(excludedSql)
  const b2bReal = `UPPER(COALESCE(s.group_name, '')) = 'B2B' AND NOT ${excl}`
  const rows = await rq(`SELECT r.day AS day,
      SUM(CASE WHEN ${b2bReal} AND ${strat} THEN r.revenue_vnd ELSE 0 END) AS b2b_strategic,
      SUM(CASE WHEN ${b2bReal} AND NOT ${strat} THEN r.revenue_vnd ELSE 0 END) AS b2b_non_strategic,
      SUM(CASE WHEN s.group_name = 'B2C' THEN r.revenue_vnd ELSE 0 END) AS b2c,
      SUM(CASE WHEN s.group_name NOT IN ('B2B', 'B2C') OR s.group_name IS NULL THEN r.revenue_vnd ELSE 0 END) AS other
    ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${flt} GROUP BY 1 ORDER BY 1`, [basis, start, end])
  return rows.map(x => ({ name: `${String(x.day).slice(8, 10)}/${String(x.day).slice(5, 7)}`, b2b_strategic: nstr(x.b2b_strategic), b2b_non_strategic: nstr(x.b2b_non_strategic), b2c: nstr(x.b2c), other: nstr(x.other) }))
}
export const diffRevenueChart = (raw: PerfRow[], ru: PerfRow[]) => { const d = diffRows(raw, ru, x => x.name, ["b2b_strategic", "b2b_non_strategic", "b2c", "other"]); return { ok: d.ok, rows: d } }
export { t as _t }
