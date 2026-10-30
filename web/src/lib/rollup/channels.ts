import { rq } from "./client"
import { custFilterSql } from "./filters"
import { diffRows } from "./quarter"
import type { PerfRow } from "./b2bperf"
import { serve, type RollupCtx } from "./serve"

// Rollup cho 4 route /api/analytics/channels/* (kpis, performance, trend, b2b-customers). Các route Channels luôn loại phí ship + đơn nội bộ + khách INACTIVE + danh sách loại trừ
// (trừ b2b-customers có bộ lọc riêng). Phạm vi (kênh hoặc nhóm) là điều kiện trên dm_source. Số đơn cộng theo ngày nên xấp xỉ (plan §16).
export interface ChArgs { basis: "ful" | "sal"; start: string; end: string; excludedCustomers: string[]; includeShip?: boolean; includeInternalOps?: boolean; channelName?: string; channelGroup?: string }

const esc = (v: string) => v.replace(/'/g, "''")
const FROM = "FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source"
const filt = (a: Pick<ChArgs, "excludedCustomers" | "includeShip" | "includeInternalOps">) => custFilterSql({ includeShip: !!a.includeShip, includeInternalOps: !!a.includeInternalOps, inactive: true, excludedCustomers: a.excludedCustomers })
const collator = new Intl.Collator("en")
const nstr = (v: unknown) => String(Number(v ?? 0))
const strRow = (r: Record<string, unknown>): PerfRow => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? (null as unknown as string) : String(v)])) as PerfRow

/** Điều kiện phạm vi (không có "AND" đầu): kênh theo TRIM(channel_name), hoặc nhóm theo UPPER(group_name); rỗng → TRUE. */
export function scopeSql(channelName?: string, channelGroup?: string): string {
  if (channelName) return `TRIM(s.channel_name) = '${esc(channelName)}'`
  if (channelGroup && channelGroup !== "All") return `UPPER(s.group_name) = '${esc(channelGroup.toUpperCase())}'`
  return "1 = 1"
}

// ── kpis ──
export interface ChKpiArgs extends ChArgs { prevStart: string; prevEnd: string }
export interface ChKpiParts { cur: PerfRow[]; prv: PerfRow[]; custRev: PerfRow[]; groupRev: PerfRow[]; nonB2b: PerfRow[] }
export async function fetchChKpisRollup(a: ChKpiArgs): Promise<ChKpiParts> {
  const f = filt(a), sc = scopeSql(a.channelName, a.channelGroup), rg = [a.basis, a.start, a.end], pg = [a.basis, a.prevStart, a.prevEnd]
  const [cur, prv, custRev, groupRev, nonB2b] = await Promise.all([
    rq(`SELECT SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS margin, SUM(r.orders) AS orders, SUM(r.qty) AS units,
        SUM(CASE WHEN UPPER(COALESCE(s.group_name, '')) = 'B2B' THEN r.revenue_vnd ELSE 0 END) AS b2b_revenue, SUM(CASE WHEN UPPER(COALESCE(s.group_name, '')) = 'B2C' THEN r.revenue_vnd ELSE 0 END) AS b2c_revenue
      ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND ${sc}${f}`, rg),
    rq(`SELECT SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS margin, SUM(r.orders) AS orders ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND ${sc}${f}`, pg),
    rq(`SELECT r.customer AS customer_code, substr(r.day, 1, 7) AS month, TRIM(s.sapo_name) AS sub, CASE WHEN ${sc} THEN 1 ELSE 0 END AS in_scope, SUM(r.revenue_vnd) AS revenue
      ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${f} AND UPPER(COALESCE(s.group_name, '')) = 'B2B' GROUP BY 1, 2, 3, 4`, rg),
    rq(`SELECT UPPER(COALESCE(s.group_name, 'OTHER')) AS grp, SUM(r.revenue_vnd) AS rev ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${f} GROUP BY 1`, rg),
    rq(`SELECT TRIM(s.channel_name) AS channel, SUM(r.revenue_vnd) AS revenue ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND ${sc}${f}
      AND UPPER(COALESCE(s.group_name, '')) NOT LIKE 'B2B%' GROUP BY 1`, rg),
  ])
  return { cur: cur.map(strRow), prv: prv.map(strRow), custRev: custRev.map(strRow), groupRev: groupRev.map(strRow), nonB2b: nonB2b.map(strRow) }
}
const sumOf = (rows: PerfRow[], k: string) => rows.reduce((t, r) => t + Number(r[k] || 0), 0)
type Diff = (raw: PerfRow[], ru: PerfRow[]) => { ok: boolean }
const ordersOk = (raw: PerfRow[], ru: PerfRow[]) => { const p = sumOf(raw, "orders"), q = sumOf(ru, "orders"); return { raw: p, rollup: q, pct: p ? Math.round(((q - p) / p) * 1000) / 10 : 0 } }
const sumsDiff = (keys: string[]): Diff => (raw, ru) => {
  const bad: string[] = [], o = ordersOk(raw, ru)
  for (const k of keys) { const p = sumOf(raw, k), q = sumOf(ru, k); if (Math.abs(p - q) > Math.max(0.5, Math.abs(p) * 1e-9)) bad.push(`${k}: thô ${p} ≠ rollup ${q}`) }
  if (Math.abs(o.pct) > 1) bad.push(`orders: thô ${o.raw} ≠ rollup ${o.rollup} (${o.pct}%)`)
  return { ok: !bad.length, bad, orders: o }
}
export const chKpiDiffs: { [K in keyof ChKpiParts]: Diff } = {
  cur: sumsDiff(["revenue", "margin", "units", "b2b_revenue", "b2c_revenue"]),
  prv: sumsDiff(["revenue", "margin"]),
  custRev: (raw, ru) => diffRows(raw, ru, r => `${r.customer_code}|${r.month}|${r.sub ?? ""}|${r.in_scope}`, ["revenue"]),
  groupRev: (raw, ru) => diffRows(raw, ru, r => String(r.grp), ["rev"]),
  nonB2b: (raw, ru) => diffRows(raw, ru, r => String(r.channel ?? ""), ["revenue"]),
}

/** Trả hàm `qa(tên)(sql)` thay cho queryAnalytics ở từng truy vấn: parts=null → đường thô nguyên vẹn; còn lại serve() (off/shadow/on) từng phần. */
export function viaRollup<P extends { [K in keyof P]: PerfRow[] }>(ctx: RollupCtx, parts: (() => Promise<P>) | null, diffs: { [K in keyof P]: Diff }, run: (sql: string) => Promise<PerfRow[]>, meta: Record<string, unknown>) {
  let memo: Promise<P> | null = null
  const get = () => (memo ??= parts!())
  return <K extends keyof P & string>(name: K) => (sql: string): Promise<PerfRow[]> =>
    parts ? serve<PerfRow[]>(ctx, () => run(sql), async () => (await get())[name], diffs[name], { ...meta, q: name }) : run(sql)
}

// ── performance ──
export interface ChPerfParts { rows: PerfRow[]; custRev: PerfRow[] }
export async function fetchChPerfRollup(a: ChArgs & { prevStart: string; prevEnd: string }): Promise<ChPerfParts> {
  const f = filt(a), sc = scopeSql(undefined, a.channelGroup)
  const [cur, prv, custRev] = await Promise.all([
    rq(`SELECT TRIM(s.channel_name) AS channel, UPPER(s.group_name) AS group_name, SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS margin, SUM(r.qty) AS units, SUM(r.orders) AS orders
      ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND ${sc}${f} GROUP BY 1, 2`, [a.basis, a.start, a.end]),
    rq(`SELECT TRIM(s.channel_name) AS channel, SUM(r.revenue_vnd) AS revenue ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND ${sc}${f} GROUP BY 1`, [a.basis, a.prevStart, a.prevEnd]),
    rq(`SELECT r.customer AS customer_code, substr(r.day, 1, 7) AS month, TRIM(s.channel_name) AS channel, SUM(r.revenue_vnd) AS revenue
      ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${f} AND UPPER(COALESCE(s.group_name, '')) = 'B2B' GROUP BY 1, 2, 3`, [a.basis, a.start, a.end]),
  ])
  const pm = new Map(prv.map(r => [String(r.channel ?? ""), Number(r.revenue ?? 0)] as const))
  const rows = cur.map(r => ({ channel: r.channel == null ? (null as unknown as string) : String(r.channel), group_name: r.group_name == null ? (null as unknown as string) : String(r.group_name),
      revenue: nstr(r.revenue), margin: nstr(r.margin), units: nstr(r.units), orders: nstr(r.orders), prev_revenue: String(pm.get(String(r.channel ?? "")) ?? 0) }))
    .sort((x, y) => collator.compare(x.group_name ?? "", y.group_name ?? "") || Number(y.revenue) - Number(x.revenue))
  return { rows, custRev: custRev.map(strRow) }
}
export const chPerfDiffs: { [K in keyof ChPerfParts]: Diff } = {
  rows: (raw, ru) => { const x = diffRows(raw, ru, r => `${r.channel ?? ""}|${r.group_name ?? ""}`, ["revenue", "margin", "units", "prev_revenue"]); const o = ordersOk(raw, ru); return { ok: x.ok && Math.abs(o.pct) <= 1, rows: x, orders: o } },
  custRev: (raw, ru) => diffRows(raw, ru, r => `${r.customer_code}|${r.month}|${r.channel ?? ""}`, ["revenue"]),
}

// ── trend (theo ngày) ──
export async function fetchChTrendRollup(a: ChArgs): Promise<PerfRow[]> {
  const rows = await rq(`SELECT r.day AS name, SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS margin ${FROM}
    WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND ${scopeSql(a.channelName, a.channelGroup)}${filt(a)} GROUP BY 1 ORDER BY 1`, [a.basis, a.start, a.end])
  return rows.map(r => ({ name: String(r.name), revenue: nstr(r.revenue), margin: nstr(r.margin) }))
}
export const diffChTrend = (raw: PerfRow[], ru: PerfRow[]) => { const d = diffRows(raw, ru, r => String(r.name), ["revenue", "margin"]); return { ok: d.ok, rows: d } }

// ── b2b-customers ──
export async function fetchChB2bCustomersRollup(start: string, end: string): Promise<PerfRow[]> {
  const rows = await rq(`SELECT r.customer AS customer_code, COALESCE(c.name, r.customer) AS customer_name, c.price_list_name AS price_list_name, SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS margin, SUM(r.orders) AS orders, SUM(r.qty) AS units
    FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer
    WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B' AND NOT (UPPER(COALESCE(c.price_list_name, '')) LIKE '%INACTIVE%')
      AND COALESCE(c.name, r.customer) NOT LIKE '%B2C Customer%' AND COALESCE(c.name, r.customer) NOT LIKE '%B2B Ops%' AND r.ship = 0
    GROUP BY 1, 2, 3 ORDER BY SUM(r.revenue_vnd) DESC`, [start, end])
  return rows.map(r => ({ customer_code: String(r.customer_code), customer_name: String(r.customer_name), price_list_name: r.price_list_name == null ? (null as unknown as string) : String(r.price_list_name), revenue: nstr(r.revenue), margin: nstr(r.margin), orders: nstr(r.orders), units: nstr(r.units) }))
}
export function diffChB2bCustomers(raw: PerfRow[], ru: PerfRow[]) {
  const d = diffRows(raw, ru, r => `${r.customer_code}|${r.customer_name}|${r.price_list_name ?? ""}`, ["revenue", "margin", "units"])
  const ro = sumOf(raw, "orders"), uo = sumOf(ru, "orders"), pct = ro ? Math.round(((uo - ro) / ro) * 1000) / 10 : 0
  return { ok: d.ok && Math.abs(pct) <= 1, rows: d, orders: { raw: ro, rollup: uo, pct } }
}
