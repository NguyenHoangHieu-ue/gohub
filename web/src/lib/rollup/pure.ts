// Rollup Analytics (plan docs/plans/analytics-rollup.md) — phần THUẦN: kiểu dữ liệu, ngày tháng, băm theo ngày, so khác biệt. Không I/O → có unit test.
export type Basis = "ful" | "sal"   // ful = theo ngày giao (fact_fulfillment_revenue), sal = theo ngày tạo đơn (fact_sales_revenue)

/** Hạt ngày × công ty × kênh × khách × ship (ru_cust_day). Số đo chỉ gồm số CỘNG ĐƯỢC. */
export interface CustRow { day: string; company: string; source: string; customer: string; ship: 0 | 1; revenue: number; cogs: number; gp: number; qty: number; lines: number; orders: number; hk3: number }
/** Hạt ngày × công ty × kênh × SKU (ru_sku_day). */
export interface SkuRow { day: string; company: string; source: string; sku: string; revenue: number; cogs: number; gp: number; qty: number; lines: number; orders: number }

export const isBasis = (v: unknown): v is Basis => v === "ful" || v === "sal"
export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const monthStart = (month: string) => `${month}-01`
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`
}
/** Các tháng từ `from` tới `to` (gồm cả hai), dạng YYYY-MM. */
export function monthsInclusive(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to && out.length < 240; m = nextMonth(m)) out.push(m)
  return out
}
export const vnToday = (now = new Date()) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)

/** Chia mảng thành các lô tối đa n phần tử. */
export function chunk<T>(arr: readonly T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

// ── Băm theo ngày (cyrb53, 53 bit: va chạm quá hiếm để bỏ sót một ngày đổi) ──
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}
const n4 = (x: number) => (Math.round(x * 10_000) / 10_000).toString()
const custKey = (r: CustRow) => [r.company, r.source, r.customer, r.ship].join("\u0001")
const skuKey = (r: SkuRow) => [r.company, r.source, r.sku].join("\u0001")
const custLine = (r: CustRow) => `${custKey(r)}|${n4(r.revenue)}|${n4(r.cogs)}|${n4(r.gp)}|${n4(r.qty)}|${r.lines}|${r.orders}|${n4(r.hk3)}`
const skuLine = (r: SkuRow) => `${skuKey(r)}|${n4(r.revenue)}|${n4(r.cogs)}|${n4(r.gp)}|${n4(r.qty)}|${r.lines}|${r.orders}`

/** Băm nội dung MỘT ngày của cả hai bảng: không phụ thuộc thứ tự dòng. */
export function dayHash(cust: readonly CustRow[], sku: readonly SkuRow[]): string {
  const a = cust.map(custLine).sort().join("\n")
  const b = sku.map(skuLine).sort().join("\n")
  return `${cyrb53(a)}-${cyrb53(b, 7)}-${cust.length}-${sku.length}`
}

export function groupByDay<T extends { day: string }>(rows: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) { const l = m.get(r.day); if (l) l.push(r); else m.set(r.day, [r]) }
  return m
}

export interface DayPlan { changed: string[]; removed: string[]; same: number }
/**
 * So kết quả mới của DW (theo ngày) với băm đã lưu trong cửa sổ [start, end).
 * changed = ngày mới hoặc băm khác (ghi lại); removed = ngày đã lưu nhưng DW không còn dòng nào (xoá).
 */
export function planDays(start: string, end: string, fresh: Map<string, string>, stored: Map<string, string>): DayPlan {
  const changed: string[] = [], removed: string[] = []
  let same = 0
  for (const [day, h] of fresh) {
    if (day < start || day >= end) continue
    if (stored.get(day) === h) same++; else changed.push(day)
  }
  for (const day of stored.keys()) if (day >= start && day < end && !fresh.has(day)) removed.push(day)
  changed.sort(); removed.sort()
  return { changed, removed, same }
}

export interface Totals { revenue: number; cogs: number; gp: number; qty: number; lines: number }
export interface TotalsDiff { ok: boolean; diffs: Partial<Record<keyof Totals, { raw: number; rollup: number }>> }
/** Đối chiếu tổng tháng thô với rollup: tiền lệch ≤ 1 VND, số lượng ≤ 0,001, số dòng phải bằng nhau. */
export function compareTotals(raw: Totals, rollup: Totals): TotalsDiff {
  const diffs: TotalsDiff["diffs"] = {}
  const tol: Record<keyof Totals, number> = { revenue: 1, cogs: 1, gp: 1, qty: 0.001, lines: 0 }
  for (const k of Object.keys(tol) as (keyof Totals)[]) if (Math.abs(raw[k] - rollup[k]) > tol[k]) diffs[k] = { raw: raw[k], rollup: rollup[k] }
  return { ok: Object.keys(diffs).length === 0, diffs }
}

/** Số cột mỗi bảng, dùng đếm lượt ghi Turso (hạn mức 10 triệu lượt ghi/tháng). */
export const CUST_COLS = 13
export const SKU_COLS = 11
