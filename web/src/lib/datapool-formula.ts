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

/** Giá trị đang áp dụng: key mới → key cũ (3hk.*) → mặc định. */
export function resolveFormula(rows: { key: string; value: unknown }[]): Record<string, number> {
  const byKey = new Map(rows.map(r => [r.key, parseFloat(String(r.value))]))
  const ok = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : undefined)
  const out: Record<string, number> = {}
  for (const d of DATAPOOL_FORMULA) out[d.key] = ok(byKey.get(d.key)) ?? (d.legacy ? ok(byKey.get(d.legacy)) : undefined) ?? d.def
  return out
}
