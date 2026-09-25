// Logic thuần cho view "Performance" (Quarter Report): bảng Revenue/GP/CM1/3HK theo tháng + quý cho ALL / B2B / B2C.
// Không đụng DB/React — dễ unit test. Dữ liệu nguồn = response `quarterly-report` (QReport) của từng quý.

import type { QReport, MonthStats } from "@/lib/quarterly-types"

export type Segment = "ALL" | "B2B" | "B2C"
export const SEGMENTS: Segment[] = ["ALL", "B2B", "B2C"]
export type Metric = "rev" | "gp" | "cm1" | "hk3"
export const METRICS: Metric[] = ["rev", "gp", "cm1", "hk3"]
export type Vals = Partial<Record<Metric, number>>

/** Target theo tháng của 1 quý cho 1 segment: mỗi metric 3 phần tử (0 = chưa nhập). */
export type SegTargets = Record<"rev" | "gp" | "cm1" | "hk3rev", number[]>
export type CompanyTargets = Partial<Record<Segment, SegTargets>>

const statsOf = (m: { total: MonthStats; b2b: MonthStats; b2c: MonthStats }, seg: Segment): MonthStats =>
  seg === "ALL" ? m.total : seg === "B2B" ? m.b2b : m.b2c

/** hk3Rev có sẵn từ route mới; response cũ (CDN cache) chưa có → suy từ hk3Pct × revenue. */
const hk3Of = (s: MonthStats) => s.hk3Rev ?? ((s.hk3Pct ?? 0) / 100) * s.revenue

export interface QuarterData {
  /** month "YYYY-MM" → giá trị (chỉ tháng đã có số liệu). */
  months: Record<string, Vals>
  total: Vals
}

/** Rút số liệu của 1 segment từ QReport: từng tháng + tổng quý (Σ các tháng đã có). Chưa có tháng nào → total = {} (KHÔNG phải 0). */
export function extractQuarter(report: QReport | null | undefined, seg: Segment): QuarterData {
  const months: Record<string, Vals> = {}
  const total: Vals = {}
  for (const m of report?.summary ?? []) {
    const s = statsOf(m, seg)
    const v: Vals = { rev: s.revenue, gp: s.gp, cm1: s.cm1, hk3: hk3Of(s) }
    months[m.month] = v
    for (const k of METRICS) total[k] = (total[k] ?? 0) + (v[k] ?? 0)
  }
  return { months, total }
}

/** Quý đang xem đủ tin cậy để so QoQ/cộng cả năm: đủ 3 tháng có số liệu và mỗi tháng hoặc đã xong hoặc đã được chiếu Pro-rata. */
export function isQuarterReliable(report: QReport | null | undefined, monthKeys: string[]): boolean {
  return monthKeys.every(k => {
    const sm = report?.summary?.find(x => x.month === k)
    return !!sm && (sm.elapsed >= sm.dim || sm.isProjected)
  })
}

/** Target 3 tháng của 1 segment → Vals theo tháng (0 → undefined = chưa nhập). */
export function targetMonths(t: SegTargets | undefined): Vals[] {
  return [0, 1, 2].map(i => ({
    rev: t?.rev?.[i] || undefined, gp: t?.gp?.[i] || undefined,
    cm1: t?.cm1?.[i] || undefined, hk3: t?.hk3rev?.[i] || undefined,
  }))
}

/** ALL chưa nhập target thì lấy B2B + B2C (theo từng tháng/metric; thiếu cả 2 → chưa nhập). */
export function effectiveTargets(all: CompanyTargets | undefined): Record<Segment, Vals[]> {
  const b2b = targetMonths(all?.B2B), b2c = targetMonths(all?.B2C), direct = targetMonths(all?.ALL)
  const merged = direct.map((d, i) => {
    const out: Vals = { ...d }
    for (const k of METRICS) {
      if (out[k] == null && (b2b[i][k] != null || b2c[i][k] != null)) out[k] = (b2b[i][k] ?? 0) + (b2c[i][k] ?? 0)
    }
    return out
  })
  return { ALL: merged, B2B: b2b, B2C: b2c }
}

/** Tổng 3 tháng target; metric nào chưa có tháng nào → undefined. */
export function sumVals(list: Vals[]): Vals {
  const out: Vals = {}
  for (const k of METRICS) {
    const vs = list.map(v => v[k]).filter((x): x is number => x != null)
    if (vs.length) out[k] = vs.reduce((s, x) => s + x, 0)
  }
  return out
}

export const addVals = (a: Vals, b: Vals): Vals => {
  const out: Vals = {}
  for (const k of METRICS) if (a[k] != null || b[k] != null) out[k] = (a[k] ?? 0) + (b[k] ?? 0)
  return out
}

/** % (GP%, CM1%, 3HK%) = tử / doanh thu × 100; thiếu số hoặc doanh thu ≤ 0 → undefined. */
export const ratioPct = (num?: number, rev?: number) => (num != null && rev != null && rev > 0 ? (num / rev) * 100 : undefined)

/** %QoQ theo quy ước bảng của Hiếu: thay đổi TƯƠNG ĐỐI (new − old)/|old|, cả với dòng %; old = 0 hoặc thiếu → undefined. */
export const relChange = (next?: number, prev?: number) =>
  next != null && prev != null && prev !== 0 ? ((next - prev) / Math.abs(prev)) * 100 : undefined

export interface RowDef { key: string; label: string; metric?: Metric; num?: Metric }
export const ROW_DEFS: RowDef[] = [
  { key: "rev",     label: "Revenue",      metric: "rev" },
  { key: "gp",      label: "GP",           metric: "gp" },
  { key: "gp_pct",  label: "GP%",          num: "gp" },
  { key: "cm1",     label: "CM1",          metric: "cm1" },
  { key: "cm1_pct", label: "CM1%",         num: "cm1" },
  { key: "hk3",     label: "3HK/Datapool", metric: "hk3" },
  { key: "hk3_pct", label: "3HK%",         num: "hk3" },
]

/** Giá trị 1 dòng (số tuyệt đối hoặc %) từ bộ Vals. */
export const cellOf = (row: RowDef, v: Vals): number | undefined =>
  row.metric ? v[row.metric] : ratioPct(v[row.num!], v.rev)

/** Các quý đứng trước quý q trong cùng năm (q=3 → [1, 2]). */
export const quartersBefore = (q: number) => Array.from({ length: q - 1 }, (_, i) => i + 1)
