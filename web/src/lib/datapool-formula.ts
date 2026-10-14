/**
 * Công thức COGS DATAPOOL dùng chung (3HK Datapool, BC Datapool...) — các giả định "khách thực dùng bao nhiêu data".
 * Lưu ở app_settings key `datapool.*`; các key cũ `3hk.*` (trước đây chỉ dành cho 3HK) vẫn được đọc làm giá trị dự phòng
 * để không mất số đã nhập.
 */
export interface FormulaDef {
  key: string
  /** Key cũ (chỉ 3HK) — đọc dự phòng khi chưa có key mới */
  legacy?: string
  label: string
  hint: string
  unit: string
  def: number
}

export const DATAPOOL_FORMULA: FormulaDef[] = [
  { key: "datapool.fixed_factor", legacy: "3hk.fixed_factor", label: "Gói Fixed — % data thực dùng", unit: "(0 – 1)", def: 0.55,
    hint: "GB tính giá = tổng GB gói × hệ số này (VD 0.55 = khách dùng thực 55%)" },
  { key: "datapool.daily_factor", legacy: "3hk.daily_factor", label: "Gói Daily — % data thực dùng", unit: "(0 – 1)", def: 0.38,
    hint: "GB tính giá = GB/ngày × số ngày × hệ số này" },
  { key: "datapool.unlim_500mb_5mbps_gb_day", legacy: "3hk.unlim_5mbps_gb_day", label: "500MB tốc độ cao + Unlimited tốc độ 5Mbps — GB/ngày (kiểu cũ)", unit: "GB/ngày", def: 1.6,
    hint: "Kiểu cũ 1 mốc tốc độ cao + Unlimited — chỉ còn dùng cho 3HK. BC Datapool KHÔNG dùng. GB tính giá = số này × số ngày" },
  { key: "datapool.unlim_500mb_10mbps_gb_day", legacy: "3hk.unlim_10mbps_gb_day", label: "500MB tốc độ cao + Unlimited tốc độ 10Mbps — GB/ngày (kiểu cũ)", unit: "GB/ngày", def: 1.8,
    hint: "Kiểu cũ 1 mốc tốc độ cao + Unlimited — chỉ còn dùng cho 3HK. BC Datapool KHÔNG dùng. GB tính giá = số này × số ngày" },
  { key: "datapool.unlim_3gb_10mbps_gb_day", label: "Unlimited 2 mức throttle: 3GB tốc độ cao + 3GB 10Mbps + Unlimited 1Mbps — GB/ngày", unit: "GB/ngày", def: 1.7,
    hint: "Mức MỚI dùng cho BC Datapool (BC bán dưới dạng Daily 6GB throttle 1Mbps); sau này sẽ thêm các giả định mức throttle khác. GB tính giá = số này × số ngày" },
]

export const FORMULA_KEYS = {
  fixed: "datapool.fixed_factor",
  daily: "datapool.daily_factor",
  unl500mb5: "datapool.unlim_500mb_5mbps_gb_day",
  unl500mb10: "datapool.unlim_500mb_10mbps_gb_day",
  unl3gb10: "datapool.unlim_3gb_10mbps_gb_day",
} as const

/** Key lưu các mức Unlimited do người dùng tự thêm (JSON mảng CustomUnlimited) — thêm ở Admin › Cài đặt › Công Thức Datapool. */
export const CUSTOM_UNLIMITED_KEY = "datapool.unlimited_custom"

/** 1 mức Unlimited tự thêm: tốc độ cao (MB/ngày) + tốc độ Unlimited (Mbps) → GB/ngày dùng tính giá. */
export interface CustomUnlimited { dataMb: number; speedMbps: number; gbPerDay: number }

export const customUnlimitedLabel = (c: CustomUnlimited) =>
  `${c.dataMb % 1024 === 0 ? `${c.dataMb / 1024}GB` : `${c.dataMb}MB`} tốc độ cao + Unlimited ${c.speedMbps}Mbps`

/** Lọc dữ liệu hợp lệ của danh sách mức (dataMb, speedMbps, gbPerDay > 0; bỏ trùng cặp dataMb+speedMbps). */
export function sanitizeLevels(arr: unknown): CustomUnlimited[] {
  if (!Array.isArray(arr)) return []
  const seen = new Set<string>()
  const out: CustomUnlimited[] = []
  for (const x of arr) {
    const dataMb = Number((x as CustomUnlimited)?.dataMb), speedMbps = Number((x as CustomUnlimited)?.speedMbps), gbPerDay = Number((x as CustomUnlimited)?.gbPerDay)
    if (!(dataMb > 0) || !(speedMbps > 0) || !(gbPerDay > 0)) continue
    const k = `${dataMb}:${speedMbps}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ dataMb, speedMbps: speedMbps, gbPerDay })
  }
  return out
}

const parseJson = (raw: unknown): unknown => { try { return typeof raw === "string" ? JSON.parse(raw) : raw } catch { return null } }

/** Các mức tự thêm kiểu cũ (key `datapool.unlimited_custom`) — chỉ dùng để chuyển sang bảng mức mới. */
export function parseCustomUnlimited(rows: { key: string; value: unknown }[]): CustomUnlimited[] {
  return sanitizeLevels(parseJson(rows.find(r => r.key === CUSTOM_UNLIMITED_KEY)?.value))
}

/** Key lưu BẢNG MỨC UNLIMITED (JSON mảng CustomUnlimited): mỗi mức = GB tốc độ cao + mức throttle Unlimited (Mbps) + GB/ngày tính giá. Nguồn sự thật cho 3HK, BC, chatbot. */
export const UNLIMITED_LEVELS_KEY = "datapool.unlimited_levels"

/** Bảng mức khi Hiếu chưa lưu lần nào: 3 mức từ key cũ (500MB+5Mbps, 500MB+10Mbps, 3GB+10Mbps) + các mức tự thêm đã nhập trước đây. */
export function defaultUnlimitedLevels(rows: { key: string; value: unknown }[]): CustomUnlimited[] {
  const f = resolveFormula(rows)
  return sanitizeLevels([
    { dataMb: 500, speedMbps: 5, gbPerDay: f[FORMULA_KEYS.unl500mb5] },
    { dataMb: 500, speedMbps: 10, gbPerDay: f[FORMULA_KEYS.unl500mb10] },
    { dataMb: 3072, speedMbps: 10, gbPerDay: f[FORMULA_KEYS.unl3gb10] },
    ...parseCustomUnlimited(rows),
  ])
}

/** Bảng mức đang áp dụng: đã lưu thì dùng đúng bảng đó (kể cả rỗng), chưa lưu thì mặc định. */
export function parseUnlimitedLevels(rows: { key: string; value: unknown }[]): CustomUnlimited[] {
  const raw = rows.find(r => r.key === UNLIMITED_LEVELS_KEY)?.value
  const parsed = raw == null ? null : parseJson(raw)
  return Array.isArray(parsed) ? sanitizeLevels(parsed) : defaultUnlimitedLevels(rows)
}

export const levelMb = (amount: number, unit: "MB" | "GB") => Math.round(unit === "GB" ? amount * 1024 : amount)
export const findLevel = (levels: CustomUnlimited[], dataMb: number, speedMbps: number) => levels.find(l => l.dataMb === dataMb && l.speedMbps === speedMbps)

/** Bảng mức của 1 bộ giả định; dữ liệu cũ (chưa có unlLevels) thì dựng từ `unl3gb10` + mức tự thêm. */
export const levelsOf = (a: { unl3gb10?: number; unlLevels?: CustomUnlimited[]; unlCustom?: CustomUnlimited[] }): CustomUnlimited[] =>
  a.unlLevels ?? [...(a.unl3gb10 ? [{ dataMb: 3072, speedMbps: 10, gbPerDay: a.unl3gb10 }] : []), ...(a.unlCustom ?? [])]

/** Giá trị đang áp dụng: key mới → key cũ (3hk.*) → mặc định. */
export function resolveFormula(rows: { key: string; value: unknown }[]): Record<string, number> {
  const byKey = new Map(rows.map(r => [r.key, parseFloat(String(r.value))]))
  const ok = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : undefined)
  const out: Record<string, number> = {}
  for (const d of DATAPOOL_FORMULA) out[d.key] = ok(byKey.get(d.key)) ?? (d.legacy ? ok(byKey.get(d.legacy)) : undefined) ?? d.def
  return out
}
