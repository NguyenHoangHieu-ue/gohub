import { rq } from "./client"
import { custFilterSql } from "./filters"
import { diffRows } from "./quarter"
import type { PerfRow } from "./b2bperf"

// Rollup cho ba nguồn BOD còn lại: bảng kênh (fetchBODChannelPerformanceData), B2B theo tier/tổ chức (fetchBODB2BTiers) và báo cáo theo ngày (fetchBODReportData).
// Mọi truy vấn gốc dùng bộ lọc chuẩn BOD (ship, đơn nội bộ, INACTIVE, loại trừ B2B) và không có bộ lọc nâng cao khi dùng rollup.
export interface BodArgs { basis: "ful" | "sal"; start: string; end: string; includeShip: boolean; includeInternalOps: boolean; excludedCustomers: string[] }
const FROM = "FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source LEFT JOIN dm_customer c ON c.customer = r.customer"
const f = (a: BodArgs) => custFilterSql({ includeShip: a.includeShip, includeInternalOps: a.includeInternalOps, inactive: true, excludedCustomers: a.excludedCustomers })
const nstr = (v: unknown) => String(Number(v ?? 0))
const t = (v: unknown) => (v == null ? (null as unknown as string) : String(v))
const ordersPct = (raw: PerfRow[], ru: PerfRow[]) => { const so = (x: PerfRow[]) => x.reduce((s, r) => s + Number(r.orders || 0), 0); const p = so(raw), q = so(ru); return { raw: p, rollup: q, pct: p ? Math.round(((q - p) / p) * 1000) / 10 : 0 } }

// ── bảng kênh ──
export interface ChannelParts { rows: PerfRow[]; custRev: PerfRow[] }
/** strategicList = chuỗi '%a%','%b%' (hoặc '') của getStrategicPartnersList; rollup dịch ILIKE ANY thành OR các LIKE (SQLite LIKE không phân biệt hoa thường với ASCII). */
export function groupCaseFromList(strategicList: string): string {
  const pats = (strategicList.match(/'((?:[^']|'')*)'/g) ?? []).map(p => p.slice(1, -1))
  const strat = pats.length ? pats.map(p => `s.channel_name LIKE '${p}'`).join(" OR ") : "0"
  return `CASE WHEN UPPER(s.group_name) = 'B2B' AND (${strat}) THEN 'B2B-Strategic' WHEN UPPER(s.group_name) = 'B2B' THEN 'B2B-Non-Strategic' WHEN UPPER(s.group_name) = 'B2C' THEN 'B2C' ELSE 'Other' END`
}
export async function fetchChannelRollup(a: BodArgs & { strategicList: string }): Promise<ChannelParts> {
  const flt = f(a)
  const [rows, cust] = await Promise.all([
    rq(`SELECT ${groupCaseFromList(a.strategicList)} AS "group", TRIM(s.channel_name) AS channel, substr(r.day, 1, 7) AS month, SUM(r.revenue_vnd) AS revenue, SUM(r.cogs_vnd) AS cogs, SUM(r.gp_vnd) AS margin, SUM(r.qty) AS units, SUM(r.orders) AS orders
      ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${flt} GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`, [a.basis, a.start, a.end]),
    rq(`SELECT r.customer AS customer_code, substr(r.day, 1, 7) AS month, TRIM(s.channel_name) AS channel, SUM(r.revenue_vnd) AS revenue
      ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${flt} AND UPPER(COALESCE(s.group_name, '')) = 'B2B' GROUP BY 1, 2, 3`, [a.basis, a.start, a.end]),
  ])
  return {
    rows: rows.map(r => ({ group: t(r.group), channel: t(r.channel), month: String(r.month), revenue: nstr(r.revenue), cogs: nstr(r.cogs), margin: nstr(r.margin), units: nstr(r.units), orders: nstr(r.orders) })),
    custRev: cust.map(r => ({ customer_code: String(r.customer_code ?? ""), month: String(r.month), channel: t(r.channel), revenue: nstr(r.revenue) })),
  }
}
export const channelDiffs = {
  rows: (raw: PerfRow[], ru: PerfRow[]) => { const d = diffRows(raw, ru, r => `${r.group ?? ""}|${r.channel ?? ""}|${r.month}`, ["revenue", "cogs", "margin", "units"]); const o = ordersPct(raw, ru); return { ok: d.ok && Math.abs(o.pct) <= 1, rows: d, orders: o } },
  custRev: (raw: PerfRow[], ru: PerfRow[]) => diffRows(raw, ru, r => `${r.customer_code}|${r.month}|${r.channel ?? ""}`, ["revenue"]),
}

// ── B2B theo tier/tổ chức ──
export async function fetchTiersRollup(a: BodArgs): Promise<PerfRow[]> {
  const rows = await rq(`SELECT r.customer AS customer_code, substr(r.day, 1, 7) AS month, COALESCE(NULLIF(TRIM(c.organization), ''), r.customer) AS org_key,
      COALESCE(NULLIF(TRIM(c.organization), ''), COALESCE(c.name, r.customer)) AS org_name, c.price_list_name AS price_list_name, COALESCE(c.name, r.customer) AS cust_name,
      SUM(r.revenue_vnd) AS revenue, SUM(r.cogs_vnd) AS cogs, SUM(r.gp_vnd) AS margin, SUM(r.qty) AS units, SUM(r.orders) AS orders
    ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${f(a)} AND UPPER(COALESCE(s.group_name, '')) = 'B2B' GROUP BY 1, 2, 3, 4, 5, 6`, [a.basis, a.start, a.end])
  return rows.map(r => ({ customer_code: String(r.customer_code ?? ""), month: String(r.month), org_key: String(r.org_key), org_name: String(r.org_name), price_list_name: t(r.price_list_name), cust_name: String(r.cust_name),
    revenue: nstr(r.revenue), cogs: nstr(r.cogs), margin: nstr(r.margin), units: nstr(r.units), orders: nstr(r.orders) }))
}
export function diffTiers(raw: PerfRow[], ru: PerfRow[]) {
  const d = diffRows(raw, ru, r => `${r.customer_code}|${r.month}|${r.org_key}|${r.price_list_name ?? ""}|${r.cust_name}`, ["revenue", "cogs", "margin", "units"])
  const o = ordersPct(raw, ru)
  return { ok: d.ok && Math.abs(o.pct) <= 1, rows: d, orders: o }
}

// ── báo cáo theo ngày ──
export interface ReportParts { dailyRows: PerfRow[]; channelDaily: PerfRow[]; channelInfo: PerfRow[]; custDaily: PerfRow[] }
export async function fetchReportRollup(a: BodArgs): Promise<ReportParts> {
  const flt = f(a), p = [a.basis, a.start, a.end]
  const [d, cd, ci, cu] = await Promise.all([
    rq(`SELECT r.day AS date, SUM(r.revenue_vnd) AS revenue, SUM(r.cogs_vnd) AS cogs, SUM(r.gp_vnd) AS margin ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${flt} GROUP BY 1 ORDER BY 1`, p),
    rq(`SELECT r.day AS date, TRIM(s.channel_name) AS channel, SUM(r.revenue_vnd) AS revenue ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${flt} GROUP BY 1, 2`, p),
    rq(`SELECT DISTINCT TRIM(channel_name) AS channel, UPPER(group_name) AS group_name FROM dm_source`),
    rq(`SELECT r.day AS date, r.customer AS customer_code, SUM(r.revenue_vnd) AS revenue ${FROM} WHERE r.basis = ? AND r.day >= ? AND r.day <= ?${flt} AND UPPER(COALESCE(s.group_name, '')) = 'B2B' GROUP BY 1, 2`, p),
  ])
  return {
    dailyRows: d.map(r => {
      const rev = Number(r.revenue ?? 0), mar = Number(r.margin ?? 0)
      return { date: String(r.date), revenue: String(rev), cogs: nstr(r.cogs), margin: String(mar), margin_percent: String(rev > 0 ? (mar / rev) * 100 : 0) }
    }),
    channelDaily: cd.map(r => ({ date: String(r.date), channel: t(r.channel), revenue: nstr(r.revenue) })),
    channelInfo: ci.map(r => ({ channel: t(r.channel), group_name: t(r.group_name) })),
    custDaily: cu.map(r => ({ date: String(r.date), customer_code: String(r.customer_code ?? ""), revenue: nstr(r.revenue) })),
  }
}
export const reportDiffs = {
  dailyRows: (raw: PerfRow[], ru: PerfRow[]) => diffRows(raw, ru, r => r.date, ["revenue", "cogs", "margin"]),
  channelDaily: (raw: PerfRow[], ru: PerfRow[]) => diffRows(raw, ru, r => `${r.date}|${r.channel ?? ""}`, ["revenue"]),
  channelInfo: (raw: PerfRow[], ru: PerfRow[]) => { const key = (x: PerfRow[]) => x.map(r => `${r.channel}:${r.group_name}`).sort().join("|"); return { ok: key(raw) === key(ru) } },
  custDaily: (raw: PerfRow[], ru: PerfRow[]) => diffRows(raw, ru, r => `${r.date}|${r.customer_code}`, ["revenue"]),
}

import { rollupFirstDay } from "./b2bperf"
import type { RollupCtx } from "./serve"
/** Ngày kết thúc dùng cho rollup (kẹp tới hôm qua như getDateFilter) nếu khoảng nằm trong vùng đã dựng và không có bộ lọc nâng cao; ngược lại null (dùng đường thô). */
export async function ruWindow(ctx: RollupCtx, basis: "ful" | "sal", start: string, end: string, extraFilters: string): Promise<string | null> {
  if (ctx.mode === "off" || extraFilters) return null
  const first = await rollupFirstDay(basis).catch(() => null)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const ruEnd = end < yesterday ? end : yesterday
  return first && start >= first && start <= ruEnd ? ruEnd : null
}
