import { rq } from "./client"
import { custFilterSql, type RollupFilter } from "./filters"

// Bản rollup của ba truy vấn trong /api/analytics/quarterly-report (phần cachedQuery). Trả ĐÚNG hình dạng của đường thô để splitQuarterRows dùng nguyên.
// Đường thô: GROUP BY tháng × nhóm × kênh (BaseRow), tháng × khách B2B (custRows), tháng × kênh × mã nguồn B2C (SourceRow).
export interface QuarterBaseRow { month: string; bg: string; channel: string | null; source_code: string | null; revenue: string; gp: string; hk3: string }
export interface QuarterCustRow { month: string; customer_code: string; revenue: string }
export interface QuarterSourceRow { month: string; channel: string | null; source_code: string | null; sapo_name: string | null; revenue: string; gp: string; hk3: string }
export interface QuarterRollupArgs extends RollupFilter { rangeStart: string; rangeEnd: string; qStartDate: string; qEndDate: string }

const nstr = (v: unknown) => String(Number(v ?? 0))
const sOrNull = (v: unknown) => (v == null ? null : String(v))
const FROM = "FROM ru_cust_day r LEFT JOIN dm_source s ON s.source = r.source"

export async function fetchQuarterRollup(a: QuarterRollupArgs): Promise<{ baseRows: QuarterBaseRow[]; custRows: QuarterCustRow[]; srcRows: QuarterSourceRow[] }> {
  const f = custFilterSql(a)
  const [base, cust, src] = await Promise.all([
    rq(`SELECT substr(r.day, 1, 7) AS month, UPPER(COALESCE(s.group_name, 'OTHER')) AS bg, TRIM(s.channel_name) AS channel, MIN(TRIM(s.source)) AS source_code,
        SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS gp, SUM(r.hk3_rev_vnd) AS hk3
        ${FROM} WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ?${f} GROUP BY 1, 2, 3`, [a.rangeStart, a.rangeEnd]),
    rq(`SELECT substr(r.day, 1, 7) AS month, r.customer AS customer_code, SUM(r.revenue_vnd) AS revenue
        ${FROM} WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2B'${f} GROUP BY 1, 2`, [a.rangeStart, a.rangeEnd]),
    rq(`SELECT substr(r.day, 1, 7) AS month, TRIM(s.channel_name) AS channel, TRIM(s.source) AS source_code, MIN(s.sapo_name) AS sapo_name,
        SUM(r.revenue_vnd) AS revenue, SUM(r.gp_vnd) AS gp, SUM(r.hk3_rev_vnd) AS hk3
        ${FROM} WHERE r.basis = 'ful' AND r.day >= ? AND r.day <= ? AND UPPER(COALESCE(s.group_name, 'OTHER')) = 'B2C'
          AND s.channel_name IS NOT NULL AND TRIM(s.channel_name) <> ''${f} GROUP BY 1, 2, 3`, [a.qStartDate, a.qEndDate]),
  ])
  return {
    baseRows: base.map(r => ({ month: String(r.month), bg: String(r.bg), channel: sOrNull(r.channel), source_code: sOrNull(r.source_code), revenue: nstr(r.revenue), gp: nstr(r.gp), hk3: nstr(r.hk3) })),
    custRows: cust.map(r => ({ month: String(r.month), customer_code: String(r.customer_code), revenue: nstr(r.revenue) })),
    srcRows: src.map(r => ({ month: String(r.month), channel: sOrNull(r.channel), source_code: sOrNull(r.source_code), sapo_name: sOrNull(r.sapo_name), revenue: nstr(r.revenue), gp: nstr(r.gp), hk3: nstr(r.hk3) })),
  }
}

// ── so sánh (shadow) ──
const num = (v: unknown) => { const x = parseFloat(String(v ?? "0")); return Number.isFinite(x) ? x : 0 }
export interface RowsDiff { ok: boolean; rawRows: number; rollupRows: number; onlyRaw: number; onlyRollup: number; valueMismatch: number; sample: string[] }

/** So hai tập dòng theo khoá; số đo lệch quá `tol` VND (tuyệt đối) hoặc 1e-9 tương đối thì tính là lệch. */
export function diffRows<T extends object>(raw: T[], rollup: T[], keyOf: (r: T) => string, measures: (keyof T)[], tol = 0.5): RowsDiff {
  const a = new Map(raw.map(r => [keyOf(r), r] as const)), b = new Map(rollup.map(r => [keyOf(r), r] as const))
  let onlyRaw = 0, onlyRollup = 0, valueMismatch = 0
  const sample: string[] = []
  const note = (s: string) => { if (sample.length < 5) sample.push(s) }
  for (const [k, r] of a) {
    const o = b.get(k)
    if (!o) { if (measures.some(m => Math.abs(num(r[m])) > tol)) { onlyRaw++; note(`chỉ thô: ${k}`) } continue }
    for (const m of measures) { if (String(r[m]) === "NaN") continue; const x = num(r[m]), y = num(o[m]);   // thô = NaN (88 dòng 31/12/2025) là lỗi dữ liệu đã biết, rollup coi NaN = 0 nên không so
       if (Math.abs(x - y) > Math.max(tol, Math.abs(x) * 1e-9)) { valueMismatch++; note(`${k} ${String(m)}: thô ${x} ≠ rollup ${y}`); break } }
  }
  for (const [k, r] of b) if (!a.has(k) && measures.some(m => Math.abs(num(r[m])) > tol)) { onlyRollup++; note(`chỉ rollup: ${k}`) }
  return { ok: !onlyRaw && !onlyRollup && !valueMismatch, rawRows: raw.length, rollupRows: rollup.length, onlyRaw, onlyRollup, valueMismatch, sample }
}

export function diffQuarter(raw: { baseRows: QuarterBaseRow[]; custRows: QuarterCustRow[]; srcRows: QuarterSourceRow[] }, ru: { baseRows: QuarterBaseRow[]; custRows: QuarterCustRow[]; srcRows: QuarterSourceRow[] }) {
  const base = diffRows(raw.baseRows, ru.baseRows, r => `${r.month}|${r.bg}|${r.channel ?? ""}`, ["revenue", "gp", "hk3"])
  const cust = diffRows(raw.custRows, ru.custRows, r => `${r.month}|${r.customer_code}`, ["revenue"])
  const src = diffRows(raw.srcRows, ru.srcRows, r => `${r.month}|${r.channel ?? ""}|${r.source_code ?? ""}`, ["revenue", "gp", "hk3"])
  return { ok: base.ok && cust.ok && src.ok, base, cust, src }
}
