// Tab "Thị trường & Báo giá" — mốc 1: breakdown doanh thu theo THỊ TRƯỜNG (nước đích) → vendor / loại sản phẩm / SKU.
// Logic thuần (không I/O) dùng chung route `api/analytics/market` và trang. Giải mã SKU 13 ký tự theo wiki business/ma-sku.md.

export type Metric = "rev" | "gp"

export interface MarketSku {
  sku: string
  vendor: string
  country_code: string
  country: string
  product_code: string
  form: string      // ký tự 2: eSIM / SIM / Data pack...
  plan: string      // ký tự 8: Daily / Fixed / Unlimited
  service: string   // Data only / Data + Call/SMS / Data + SĐT local (Supabase skus.call, products.local_phone_number)
  size: string      // "5GB · 7 ngày"
}

/** [skuIdx, monthIdx, rev, gp, units] — dạng nén để khối cache < 2MB (thô ~17k dòng ≈ 2,1MB). */
export type MarketCell = [number, number, number, number, number]

export interface MarketData {
  quarter: string; prevQuarter: string
  curStart: string; curEnd: string; prevStart: string; prevEnd: string
  months: string[]          // YYYY-MM, quý trước + quý này
  curMonths: string[]
  group: "ALL" | "B2B" | "B2C"
  skus: MarketSku[]
  cells: MarketCell[]
  cutoff: string
}

const FORM: Record<string, string> = {
  A: "Data pack (top-up)", B: "eSIM profile", C: "eSIM", D: "Khung SIM", E: "SIM",
  "1": "eSIM nội địa VN", "2": "SIM nội địa VN",
}
const UNLIMITED = new Set(["A", "B", "C", "D", "E", "G", "H", "L", "X"])
const FIXED = new Set(["F", "Y"])
const DAILY = new Set(["P", "Z", "T"])

export const SERVICE_DATA_ONLY = "Data only"
export const SERVICE_CALL = "Data + Call/SMS"
export const SERVICE_LOCAL = "Data + SĐT local"
export const SERVICE_UNKNOWN = "Chưa rõ"

function decodeSize(sku: string): string {
  const cap = sku.slice(8, 11), days = sku.slice(11, 13)
  let data = ""
  if (cap === "UNL") data = "Unlimited"
  else if (/^\d{3}$/.test(cap)) data = `${Number(cap)}GB`
  else if (/^\dHM$/.test(cap)) data = `${Number(cap[0]) * 100}MB`
  else if (/^\dD\d$/.test(cap)) data = `${cap[0]}.${cap[2]}GB`
  const d = /^\d{2}$/.test(days) ? `${Number(days)} ngày` : ""
  return [data, d].filter(Boolean).join(" · ")
}

/** Thuộc tính đọc thẳng từ mã SKU. Mã không phải 13 ký tự (mã cũ/phí) → "Khác". */
export function decodeSkuAttributes(sku: string): { form: string; plan: string; size: string; product_code: string } {
  const s = sku.toUpperCase()
  if (s.length !== 13) return { form: "Khác", plan: "Khác", size: "", product_code: s.slice(0, 8) }
  const p = s[7]
  const plan = p === "K" ? "Khung/Profile" : UNLIMITED.has(p) ? "Unlimited" : FIXED.has(p) ? "Fixed" : DAILY.has(p) ? "Daily" : "Khác"
  return { form: FORM[s[1]] ?? "Khác", plan, size: decodeSize(s), product_code: s.slice(0, 8) }
}

/** SĐT local ưu tiên hơn call/SMS (gói có số local hầu như kèm gọi). Không có trong catalog → Chưa rõ. */
export function classifyService(call: string | null | undefined, localNumber: string | null | undefined, known: boolean): string {
  if (!known) return SERVICE_UNKNOWN
  if (String(localNumber ?? "").toLowerCase() === "yes") return SERVICE_LOCAL
  if (String(call ?? "").toLowerCase() === "yes") return SERVICE_CALL
  return SERVICE_DATA_ONLY
}

export type Dimension = "country" | "vendor" | "form" | "plan" | "service" | "product_code" | "sku"
export const DIMENSION_LABEL: Record<Dimension, string> = {
  country: "Thị trường", vendor: "Vendor", form: "Hình thức", plan: "Loại gói", service: "Dịch vụ",
  product_code: "Product Code", sku: "SKU",
}

export interface Agg { rev: number; gp: number; units: number; revPrev: number; gpPrev: number; unitsPrev: number }
export const emptyAgg = (): Agg => ({ rev: 0, gp: 0, units: 0, revPrev: 0, gpPrev: 0, unitsPrev: 0 })

export interface GroupRow extends Agg { key: string; skuCount: number }

/** Gộp theo 1 chiều, có thể lọc trước (vd chỉ 1 thị trường). Sắp giảm dần theo metric kỳ này. */
export function groupBy(data: MarketData, dim: Dimension, filter?: (s: MarketSku) => boolean, metric: Metric = "rev"): GroupRow[] {
  const cur = new Set(data.curMonths.map(m => data.months.indexOf(m)))
  const map = new Map<string, GroupRow & { skus: Set<number> }>()
  for (const [si, mi, rev, gp, units] of data.cells) {
    const s = data.skus[si]
    if (filter && !filter(s)) continue
    const key = dim === "country" ? s.country : s[dim] || "(không rõ)"
    let row = map.get(key)
    if (!row) { row = { key, skuCount: 0, ...emptyAgg(), skus: new Set() }; map.set(key, row) }
    if (cur.has(mi)) { row.rev += rev; row.gp += gp; row.units += units; row.skus.add(si) }
    else { row.revPrev += rev; row.gpPrev += gp; row.unitsPrev += units }
  }
  return Array.from(map.values())
    .map(({ skus, ...r }) => ({ ...r, skuCount: skus.size }))
    .filter(r => r.rev || r.revPrev)
    .sort((a, b) => (b[metric] - a[metric]) || (b.rev - a.rev))
}

/** Ma trận hàng × cột (vd thị trường × vendor) cho chart chồng. Cột ngoài top N gộp "Khác". */
export function crossTab(data: MarketData, rowDim: Dimension, colDim: Dimension, rowKeys: string[], topCols: number,
  metric: Metric = "rev", filter?: (s: MarketSku) => boolean): { cols: string[]; rows: Record<string, number | string>[] } {
  const totals = groupBy(data, colDim, s => (!filter || filter(s)) && rowKeys.includes(rowDim === "country" ? s.country : s[rowDim]), metric)
  const cols = totals.slice(0, topCols).map(t => t.key)
  const hasOther = totals.length > topCols
  const cur = new Set(data.curMonths.map(m => data.months.indexOf(m)))
  const rows = new Map<string, Record<string, number | string>>(rowKeys.map(k => [k, { key: k }]))
  for (const [si, mi, rev, gp] of data.cells) {
    if (!cur.has(mi)) continue
    const s = data.skus[si]
    if (filter && !filter(s)) continue
    const rk = rowDim === "country" ? s.country : s[rowDim]
    const row = rows.get(rk)
    if (!row) continue
    const ck0 = colDim === "country" ? s.country : s[colDim] || "(không rõ)"
    const ck = cols.includes(ck0) ? ck0 : "Khác"
    row[ck] = (Number(row[ck]) || 0) + (metric === "rev" ? rev : gp)
  }
  return { cols: hasOther ? [...cols, "Khác"] : cols, rows: Array.from(rows.values()) }
}

/** Doanh thu theo tháng, chồng theo 1 chiều (top N + Khác) — cho chart xu hướng của 1 thị trường. */
export function monthlyBy(data: MarketData, dim: Dimension, topCols: number, metric: Metric = "rev",
  filter?: (s: MarketSku) => boolean): { cols: string[]; rows: Record<string, number | string>[] } {
  const totals = groupBy(data, dim, filter, metric)
  const cols = totals.slice(0, topCols).map(t => t.key)
  const hasOther = totals.length > topCols
  const rows = data.months.map(m => ({ key: m } as Record<string, number | string>))
  for (const [si, mi, rev, gp] of data.cells) {
    const s = data.skus[si]
    if (filter && !filter(s)) continue
    const k0 = dim === "country" ? s.country : s[dim] || "(không rõ)"
    const k = cols.includes(k0) ? k0 : "Khác"
    rows[mi][k] = (Number(rows[mi][k]) || 0) + (metric === "rev" ? rev : gp)
  }
  return { cols: hasOther ? [...cols, "Khác"] : cols, rows }
}

export const gmPct = (gp: number, rev: number) => rev > 0 ? gp / rev * 100 : 0
