import { rq } from "./client"
import { b2bFilterSql } from "./filters"
import { diffRows } from "./quarter"
import type { PerfRow } from "./b2bperf"
import type { KpiPair } from "./b2bkpis"

// Rollup cho /api/analytics/b2c/kpis và /api/analytics/b2c/trend (B2C, không bộ lọc nâng cao; không lọc INACTIVE như đường thô B2C).
export interface B2cKpiArgs { basis: "ful" | "sal"; curStart: string; curEnd: string; prevStart: string; prevEnd: string; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }
const collator = new Intl.Collator("en")
const FROM = "FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer"
const filt = (a: { includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }) => b2bFilterSql({ includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: false, excludedCustomers: a.excludedCustomers })
const cur = (col: string) => `SUM(CASE WHEN r.day >= ? AND r.day <= ? THEN ${col} ELSE 0 END)`
const prv = cur

export async function fetchB2cKpisRollup(a: B2cKpiArgs): Promise<KpiPair> {
  const f = filt(a)
  const lo = a.prevStart < a.curStart ? a.prevStart : a.curStart, hi = a.prevEnd > a.curEnd ? a.prevEnd : a.curEnd
  const p4 = [a.curStart, a.curEnd, a.prevStart, a.prevEnd]
  const [main, ch] = await Promise.all([
    rq(`SELECT ${cur("r.revenue_vnd")} AS current_revenue, ${prv("r.revenue_vnd")} AS prev_revenue, ${cur("r.gp_vnd")} AS current_margin, ${prv("r.gp_vnd")} AS prev_margin,
        ${cur("r.orders")} AS current_orders, ${prv("r.orders")} AS prev_orders, ${cur("r.qty")} AS current_units, ${prv("r.qty")} AS prev_units
      ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2C'${f}`,
    [...p4, ...p4, ...p4, ...p4, a.basis, lo, hi]),
    rq(`SELECT TRIM(s.channel_name) AS channel, r.source AS source_code, ${cur("r.revenue_vnd")} AS current_revenue, ${prv("r.revenue_vnd")} AS prev_revenue
      ${FROM} WHERE r.basis = ? AND ((r.day >= ? AND r.day <= ?) OR (r.day >= ? AND r.day <= ?)) AND UPPER(COALESCE(s.group_name, '')) = 'B2C'${f} GROUP BY 1, 2`,
    [...p4, a.basis, ...p4]),
  ])
  const str = (r: Record<string, unknown>): PerfRow => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(Number(v ?? 0))])) as PerfRow
  // Đường thô nhóm theo kênh với MIN(source_code): gộp các nguồn cùng kênh, lấy mã nhỏ nhất theo collation.
  const byCh = new Map<string, PerfRow>()
  for (const r of ch) {
    const k = String(r.channel ?? "")
    const o = byCh.get(k)
    const code = String(r.source_code ?? "")
    if (!o) byCh.set(k, { channel: r.channel == null ? (null as unknown as string) : k, source_code: code, current_revenue: String(Number(r.current_revenue ?? 0)), prev_revenue: String(Number(r.prev_revenue ?? 0)) })
    else { o.current_revenue = String(Number(o.current_revenue) + Number(r.current_revenue ?? 0)); o.prev_revenue = String(Number(o.prev_revenue) + Number(r.prev_revenue ?? 0)); if (collator.compare(code, o.source_code) < 0) o.source_code = code }
  }
  return [main.map(str), [...byCh.values()]]
}

export function diffB2cKpis(raw: KpiPair, ru: KpiPair) {
  const m = raw[0][0] ?? {}, o = ru[0][0] ?? {}
  const bad: string[] = []
  for (const k of ["current_revenue", "prev_revenue", "current_margin", "prev_margin", "current_units", "prev_units"]) {
    const x = Number(m[k] ?? 0), y = Number(o[k] ?? 0)
    if (Math.abs(x - y) > Math.max(0.5, Math.abs(x) * 1e-9)) bad.push(`${k}: thô ${x} ≠ rollup ${y}`)
  }
  const orders = ["current_orders", "prev_orders"].map(k => { const x = Number(m[k] ?? 0), y = Number(o[k] ?? 0); return { k, x, y, pct: x ? Math.round(((y - x) / x) * 1000) / 10 : 0 } })
  for (const q of orders) if (Math.abs(q.pct) > 1) bad.push(`${q.k}: thô ${q.x} ≠ rollup ${q.y} (${q.pct}%)`)
  const ch = diffRows(raw[1], ru[1], r => String(r.channel ?? ""), ["current_revenue", "prev_revenue"])
  let src = 0
  const b = new Map(ru[1].map(r => [String(r.channel ?? ""), r] as const))
  for (const r of raw[1]) { const x = b.get(String(r.channel ?? "")); if (x && (x.source_code ?? "") !== (r.source_code ?? "")) src++ }
  return { ok: !bad.length && ch.ok && !src, bad, orders, ch, srcMismatch: src }
}

// ── trend: doanh thu/lãi theo tháng hoặc quý ──
export interface B2cTrendArgs { basis: "ful" | "sal"; start: string; end: string; period: "month" | "quarter"; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }
export async function fetchB2cTrendRollup(a: B2cTrendArgs): Promise<PerfRow[]> {
  const f = filt(a)
  const bucket = a.period === "quarter" ? "substr(r.day, 1, 4) || '-Q' || ((CAST(substr(r.day, 6, 2) AS INTEGER) + 2) / 3)" : "substr(r.day, 1, 7)"
  const rows = await rq(`SELECT ${bucket} AS name, SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS margin ${FROM}
    WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2C'${f} GROUP BY 1 ORDER BY 1`, [a.basis, a.start, a.end])
  return rows.map(r => { const rev = Number(r.revenue ?? 0), mar = Number(r.margin ?? 0); return { name: String(r.name), revenue: String(rev), margin: String(mar), margin_percent: String(rev > 0 ? (mar / rev) * 100 : 0) } })
}
export function diffB2cTrend(raw: PerfRow[], ru: PerfRow[]) {
  const d = diffRows(raw, ru, r => String(r.name), ["revenue", "margin"])
  return { ok: d.ok, rows: d }
}
