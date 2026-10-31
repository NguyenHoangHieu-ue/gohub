import { rq } from "./client"
import { b2bFilterSql } from "./filters"
import { diffRows } from "./quarter"
import type { PerfRow } from "./b2bperf"

// Bản rollup của hai truy vấn trong /api/analytics/b2b/kpis: tổng kỳ này/kỳ trước (doanh thu, lãi, số đơn) và doanh thu theo khách × tháng của cả hai kỳ.
// Số đơn: rollup lưu theo NGÀY nên đơn giao nhiều ngày bị đếm nhiều lần (plan §1: lệch ≤ 1%).
export interface KpiArgs { basis: "ful" | "sal"; curStart: string; curEnd: string; prevStart: string; prevEnd: string; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }
export type KpiPair = [PerfRow[], PerfRow[]]

const DAY = 86400000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const utc = (s: string) => Date.parse(`${s}T00:00:00Z`)

/** Khoảng kỳ trước đúng như getPrevDateFilter: previous_year lùi 1 năm; còn lại là khoảng liền trước cùng độ dài. */
export function prevRange(sd: string, ed: string, comparisonType: string): { start: string; end: string } {
  if (comparisonType === "previous_year") {
    const s = new Date(sd); s.setFullYear(s.getFullYear() - 1)
    const e = new Date(ed); e.setFullYear(e.getFullYear() - 1)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    return { start: fmt(s), end: fmt(e) }
  }
  const len = (utc(ed) - utc(sd)) / DAY + 1
  return { start: iso(utc(sd) - len * DAY), end: iso(utc(sd) - DAY) }
}

export async function fetchB2bKpisRollup(a: KpiArgs): Promise<KpiPair> {
  const f = b2bFilterSql({ includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: true, excludedCustomers: a.excludedCustomers })
  const FROM = "FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer"
  const [main, cust] = await Promise.all([
    rq(`SELECT SUM(CASE WHEN r.day >= ? AND r.day <= ? THEN r.revenue_vnd ELSE 0 END) AS current_revenue, SUM(CASE WHEN r.day >= ? AND r.day <= ? THEN r.revenue_vnd ELSE 0 END) AS prev_revenue,
        SUM(CASE WHEN r.day >= ? AND r.day <= ? THEN r.gp_vnd ELSE 0 END) AS current_margin, SUM(CASE WHEN r.day >= ? AND r.day <= ? THEN r.gp_vnd ELSE 0 END) AS prev_margin,
        SUM(CASE WHEN r.day >= ? AND r.day <= ? THEN r.orders ELSE 0 END) AS current_orders, SUM(CASE WHEN r.day >= ? AND r.day <= ? THEN r.orders ELSE 0 END) AS prev_orders
      ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${f}`,
    [a.curStart, a.curEnd, a.prevStart, a.prevEnd, a.curStart, a.curEnd, a.prevStart, a.prevEnd, a.curStart, a.curEnd, a.prevStart, a.prevEnd, a.basis, a.prevStart < a.curStart ? a.prevStart : a.curStart, a.prevEnd > a.curEnd ? a.prevEnd : a.curEnd]),
    rq(`SELECT r.customer AS customer_code, substr(r.day, 1, 7) AS month,
        SUM(CASE WHEN r.day >= ? AND r.day <= ? THEN r.revenue_vnd ELSE 0 END) AS current_revenue, SUM(CASE WHEN r.day >= ? AND r.day <= ? THEN r.revenue_vnd ELSE 0 END) AS prev_revenue
      ${FROM} WHERE r.basis = ? AND ((r.day >= ? AND r.day <= ?) OR (r.day >= ? AND r.day <= ?)) AND UPPER(COALESCE(s.group_name, '')) = 'B2B'${f} GROUP BY 1, 2`,
    [a.curStart, a.curEnd, a.prevStart, a.prevEnd, a.basis, a.curStart, a.curEnd, a.prevStart, a.prevEnd]),
  ])
  const str = (r: Record<string, unknown>): PerfRow => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(Number(v ?? 0))])) as PerfRow
  return [main.map(str), cust.map(r => ({ customer_code: String(r.customer_code ?? ""), month: String(r.month), current_revenue: String(Number(r.current_revenue ?? 0)), prev_revenue: String(Number(r.prev_revenue ?? 0)) }))]
}

export function diffB2bKpis(raw: KpiPair, ru: KpiPair) {
  const m = raw[0][0] ?? {}, o = ru[0][0] ?? {}
  const bad: string[] = []
  for (const k of ["current_revenue", "prev_revenue", "current_margin", "prev_margin"]) {
    const x = Number(m[k] ?? 0), y = Number(o[k] ?? 0)
    if (Math.abs(x - y) > Math.max(0.5, Math.abs(x) * 1e-9)) bad.push(`${k}: thô ${x} ≠ rollup ${y}`)
  }
  const orders = ["current_orders", "prev_orders"].map(k => { const x = Number(m[k] ?? 0), y = Number(o[k] ?? 0); return { k, x, y, pct: x ? Math.round(((y - x) / x) * 1000) / 10 : 0 } })
  for (const q of orders) if (Math.abs(q.pct) > 1) bad.push(`${q.k}: thô ${q.x} ≠ rollup ${q.y} (${q.pct}%)`)
  const cust = diffRows(raw[1], ru[1], r => `${r.month}|${r.customer_code}`, ["current_revenue", "prev_revenue"])
  return { ok: !bad.length && cust.ok, bad, orders, cust }
}
