import type { Assumptions, Fx, PlanLine, PoolPriceList, SimType } from "./types"

/** ROUNDUP kiểu Excel (2 số lẻ), chống sai số dấu phẩy động. */
export const ceil2 = (x: number) => Math.ceil(x * 100 - 1e-9) / 100
const toGb = (amount: number, unit: "MB" | "GB") => (unit === "MB" ? amount / 1024 : amount)
export const toMb = (amount: number, unit: "MB" | "GB") => (unit === "GB" ? amount * 1024 : amount)

export type UnlimitedKey = "unl500mb5" | "unl500mb10" | "unl3gb10"

/**
 * GB/ngày dùng để tính giá gói Unlimited theo tổ hợp (data tốc độ cao, tốc độ Unlimited):
 * 500MB + 5Mbps → 1.6 · 500MB + 10Mbps → 1.8 · 3GB + 10Mbps → 1.7 (Công Thức Datapool). Tổ hợp khác chưa có hệ số → null (không đoán).
 */
export function unlimitedFactor(a: Assumptions, amount: number, unit: "MB" | "GB", speedMbps = 10): { key: UnlimitedKey; gbPerDay: number } | null {
  const mb = toMb(amount, unit)
  const key: UnlimitedKey | null = mb === 500 && speedMbps === 5 ? "unl500mb5" : mb === 500 && speedMbps === 10 ? "unl500mb10" : mb === 3072 && speedMbps === 10 ? "unl3gb10" : null
  return key ? { key, gbPerDay: a[key] } : null
}

/**
 * COGS data (USD) của 1 SKU theo bảng COGS BC Datapool:
 *  Fixed = tổng GB × giá/GB × 55% · Daily = GB/ngày × số ngày × giá/GB × 38% · Unlimited = 1.7GB × số ngày × giá/GB.
 * Làm tròn lên 2 số lẻ ở tiền của pool, rồi quy USD (pool HKD) và làm tròn lên lần nữa — đúng như file mẫu.
 */
export function dataCostPool(plan: PlanLine, days: number, pricePerGb: number, a: Assumptions): number {
  let raw: number
  if (plan.kind === "Fixed") raw = pricePerGb * toGb(plan.dataAmount, plan.unit) * a.fixedPct
  else if (plan.kind === "Daily") raw = pricePerGb * toGb(plan.dataAmount, plan.unit) * days * a.dailyPct
  else raw = pricePerGb * (unlimitedFactor(a, plan.dataAmount, plan.unit, plan.speedMbps ?? 10)?.gbPerDay ?? 0) * days
  return ceil2(raw)
}

export function dataCostUsd(plan: PlanLine, days: number, pricePerGb: number, currency: "HKD" | "USD", fx: Fx, a: Assumptions): number {
  const inPoolCurrency = dataCostPool(plan, days, pricePerGb, a)
  return currency === "HKD" ? ceil2(inPoolCurrency / fx.hkdPerUsd) : inPoolCurrency
}

/**
 * Phí khung (USD), ROUNDUP 2 số lẻ (mọi công thức đều ROUNDUP — quy định của Hiếu):
 *  eSIM = phí eSIM (CNY) quy USD + phí IMSI (tiền tệ của pool) quy USD.
 *  SIM  = giá SIM trắng (lấy từ DB, VND) quy USD theo tỷ giá Inc (VND→USD) + phí IMSI quy USD.
 */
export function frameFeeUsd(sim: SimType, list: PoolPriceList, fx: Fx, whiteSimVnd = 0): number {
  const imsiUsd = list.currency === "HKD" ? list.imsiFee / fx.hkdPerUsd : list.imsiFee
  const carrierUsd = sim === "eSIM" ? list.esimFeeCny / fx.cnyPerUsd : whiteSimVnd / fx.vndPerUsdInc
  return ceil2(carrierUsd + imsiUsd)
}

export const usdToVnd = (usd: number, fx: Fx) => Math.ceil(usd * fx.vndPerUsd - 1e-9)
