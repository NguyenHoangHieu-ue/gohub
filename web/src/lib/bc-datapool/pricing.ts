import type { Assumptions, Fx, PlanLine, PoolPriceList, SimType } from "./types"

/** ROUNDUP kiểu Excel (2 số lẻ), chống sai số dấu phẩy động. */
export const ceil2 = (x: number) => Math.ceil(x * 100 - 1e-9) / 100
const toGb = (amount: number, unit: "MB" | "GB") => (unit === "MB" ? amount / 1024 : amount)

/**
 * COGS data (USD) của 1 SKU theo bảng COGS BC Datapool:
 *  Fixed = tổng GB × giá/GB × 55% · Daily = GB/ngày × số ngày × giá/GB × 38% · Unlimited = 1.7GB × số ngày × giá/GB.
 * Làm tròn lên 2 số lẻ ở tiền của pool, rồi quy USD (pool HKD) và làm tròn lên lần nữa — đúng như file mẫu.
 */
export function dataCostPool(plan: PlanLine, days: number, pricePerGb: number, a: Assumptions): number {
  let raw: number
  if (plan.kind === "Fixed") raw = pricePerGb * toGb(plan.dataAmount, plan.unit) * a.fixedPct
  else if (plan.kind === "Daily") raw = pricePerGb * toGb(plan.dataAmount, plan.unit) * days * a.dailyPct
  else raw = pricePerGb * a.unlimitedGbPerDay * days
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
