/**
 * Bảng tỷ giá nội bộ THEO THÁNG × PHÁP NHÂN (Gohub JSC — VND, Gohub Inc — USD) — phần THUẦN, dùng được ở cả server lẫn trình duyệt.
 * Mọi tỷ giá lưu dạng "số đơn vị `quote` cho 1 đơn vị `base`" (VD VND/USD = 26266 nghĩa là 1 USD = 26266 VND).
 *
 * Quy tắc chiều đổi (Hiếu chốt 2026-09-30):
 *  · USD → VND dùng tỷ giá JSC (VND/USD, VD 26.266) — bán hàng VN thu bằng VND.
 *  · VND → USD dùng tỷ giá Inc (VNĐ/USD, VD 25.731) — ghi nhận chi phí VND vào sổ Inc bằng USD.
 *  · USD ↔ ngoại tệ khác (HKD, CNY, JPY, THB, EUR, GBP, SGD, TWD): tỷ giá Inc (X/USD), cả hai chiều.
 *  · VND ↔ CNY / HKD / GBP: tỷ giá JSC (VND/X), cả hai chiều.
 *  · Cặp còn lại: đổi qua USD.
 */
export type Ccy = "USD" | "VND" | "CNY" | "HKD" | "GBP" | "JPY" | "THB" | "EUR" | "SGD" | "TWD"
export type Entity = "JSC" | "INC"

export interface FxRowDef {
  id: string
  entity: Entity
  /** Đơn vị được đo */
  quote: Ccy
  /** 1 đơn vị của `base` = `rate` đơn vị `quote` */
  base: Ccy
  label: string
}

export const ENTITY_LABEL: Record<Entity, string> = { JSC: "Gohub JSC", INC: "Gohub Inc" }

const row = (entity: Entity, quote: Ccy, base: Ccy, label: string): FxRowDef => ({ id: `${entity}:${quote}/${base}`, entity, quote, base, label })

/** 13 dòng đúng như file "Tỷ giá nội bộ theo tháng.xlsx" */
export const FX_ROWS: FxRowDef[] = [
  row("JSC", "VND", "USD", "VND / 1 USD"),
  row("JSC", "VND", "CNY", "VND / 1 CNY"),
  row("JSC", "VND", "HKD", "VND / 1 HKD"),
  row("JSC", "VND", "GBP", "VND / 1 GBP"),
  row("INC", "VND", "USD", "VNĐ / 1 USD"),
  row("INC", "HKD", "USD", "HKD / 1 USD"),
  row("INC", "JPY", "USD", "JPY / 1 USD"),
  row("INC", "THB", "USD", "THB / 1 USD"),
  row("INC", "CNY", "USD", "CNY / 1 USD"),
  row("INC", "EUR", "USD", "EUR / 1 USD"),
  row("INC", "GBP", "USD", "GBP / 1 USD"),
  row("INC", "SGD", "USD", "SGD / 1 USD"),
  row("INC", "TWD", "USD", "TWD / 1 USD"),
]

/** id dòng → { "2026-09": 26266, ... } */
export interface FxTable { version: 1; values: Record<string, Record<string, number>> }

export const emptyTable = (): FxTable => ({ version: 1, values: {} })

/** T01/2026 … T12/2027 như file Excel */
export const MONTHS: string[] = Array.from({ length: 24 }, (_, i) => `${2026 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`)
export const monthLabel = (m: string) => `T${m.slice(5)}/${m.slice(0, 4)}`
export const parseMonthLabel = (s: string): string | null => {
  const m = /^T(\d{1,2})\/(\d{4})$/i.exec(s.trim())
  return m ? `${m[2]}-${m[1].padStart(2, "0")}` : null
}
export const currentMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

export interface RateHit { rate: number; month: string }

/** Tỷ giá của dòng `id` ở tháng `month`; chưa nhập thì lấy tháng gần nhất TRƯỚC ĐÓ đã nhập (không lấy tương lai). */
export function rateAt(t: FxTable, id: string, month: string): RateHit | null {
  const v = t.values[id]
  if (!v) return null
  let best: RateHit | null = null
  for (const [m, rate] of Object.entries(v)) {
    if (m > month || !(rate > 0)) continue
    if (!best || m > best.month) best = { rate, month: m }
  }
  return best
}

export interface ConvertStep { rowId: string; rate: number; month: string; op: "×" | "÷" }
export interface Converted { value: number; steps: ConvertStep[] }

const toUsdRow = (c: Ccy) => `INC:${c}/USD`
const fromUsdRow = (c: Ccy) => (c === "VND" ? "JSC:VND/USD" : `INC:${c}/USD`)
const JSC_DIRECT = new Set<Ccy>(["CNY", "HKD", "GBP"])

/** Đổi tiền theo quy tắc chiều đổi ở đầu file. Trả null nếu thiếu tỷ giá cần dùng. */
export function convert(t: FxTable, amount: number, from: Ccy, to: Ccy, month: string): Converted | null {
  if (from === to) return { value: amount, steps: [] }
  const one = (rowId: string, op: "×" | "÷", x: number): Converted | null => {
    const hit = rateAt(t, rowId, month)
    return hit ? { value: op === "×" ? x * hit.rate : x / hit.rate, steps: [{ rowId, rate: hit.rate, month: hit.month, op }] } : null
  }
  if (to === "USD") return one(toUsdRow(from), "÷", amount)
  if (from === "USD") return one(fromUsdRow(to), "×", amount)
  // VND ↔ CNY/HKD/GBP: ưu tiên tỷ giá JSC trực tiếp; chưa nhập dòng đó thì đổi qua USD
  if (to === "VND" && JSC_DIRECT.has(from)) { const r = one(`JSC:VND/${from}`, "×", amount); if (r) return r }
  if (from === "VND" && JSC_DIRECT.has(to)) { const r = one(`JSC:VND/${to}`, "÷", amount); if (r) return r }
  const a = convert(t, amount, from, "USD", month)
  const b = a && convert(t, a.value, "USD", to, month)
  return a && b ? { value: b.value, steps: [...a.steps, ...b.steps] } : null
}

/**
 * Khoá phẳng `fx.*` cho các nơi cũ (chatbot, MCP, admin-gohub) — GIỮ NGUYÊN quy ước "số đơn vị cho 1 USD" (hoặc VND cho 1 X với JSC):
 * fx.usd_vnd = JSC VND/USD · fx.vnd_usd_inc = Inc VNĐ/USD (VND→USD) · fx.vnd_cny/gbp/hkd = JSC · fx.hkd_usd, fx.twd_usd, fx.usd_jpy/thb/cny/eur/gbp/sgd = Inc.
 */
export const FLAT_KEYS: Record<string, string> = {
  "JSC:VND/USD": "fx.usd_vnd", "INC:VND/USD": "fx.vnd_usd_inc", "JSC:VND/CNY": "fx.vnd_cny", "JSC:VND/HKD": "fx.vnd_hkd", "JSC:VND/GBP": "fx.vnd_gbp",
  "INC:HKD/USD": "fx.hkd_usd", "INC:TWD/USD": "fx.twd_usd", "INC:JPY/USD": "fx.usd_jpy", "INC:THB/USD": "fx.usd_thb", "INC:CNY/USD": "fx.usd_cny",
  "INC:EUR/USD": "fx.usd_eur", "INC:GBP/USD": "fx.usd_gbp", "INC:SGD/USD": "fx.usd_sgd",
}

export function toFlat(t: FxTable, month: string): { key: string; value: number; label: string; month: string }[] {
  const out: { key: string; value: number; label: string; month: string }[] = []
  for (const def of FX_ROWS) {
    const hit = rateAt(t, def.id, month)
    if (hit) out.push({ key: FLAT_KEYS[def.id], value: hit.rate, label: `${ENTITY_LABEL[def.entity]} · ${def.label} (${monthLabel(hit.month)})`, month: hit.month })
  }
  return out
}

/** Đặt 1 ô; rate rỗng/không hợp lệ thì xoá ô. Trả bảng mới (không sửa bảng cũ). */
export function setCell(t: FxTable, id: string, month: string, rate: number | null): FxTable {
  const values = { ...t.values, [id]: { ...(t.values[id] ?? {}) } }
  if (rate != null && Number.isFinite(rate) && rate > 0) values[id][month] = rate
  else delete values[id][month]
  return { version: 1, values }
}

/** % biến động so với tháng liền trước đã nhập (dòng "Biến động MoM" trong file Excel). */
export function momPct(t: FxTable, id: string, month: string): number | null {
  const v = t.values[id]
  if (!v || !(v[month] > 0)) return null
  let prev: number | null = null, pm = ""
  for (const [m, r] of Object.entries(v)) if (m < month && r > 0 && m > pm) { prev = r; pm = m }
  return prev ? (v[month] - prev) / prev : null
}
