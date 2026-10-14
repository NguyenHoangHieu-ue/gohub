import { customUnlimitedLabel, levelsOf } from "@/lib/datapool-formula"
import { type Assumptions, type Fx, type PlanLine, type PoolPriceList, type SimType } from "./types"

/** ROUNDUP kiểu Excel (2 số lẻ), chống sai số dấu phẩy động. */
export const ceil2 = (x: number) => Math.ceil(x * 100 - 1e-9) / 100
const toGb = (amount: number, unit: "MB" | "GB") => (unit === "MB" ? amount / 1024 : amount)
export const toMb = (amount: number, unit: "MB" | "GB") => (unit === "GB" ? amount * 1024 : amount)

/**
 * GB/ngày dùng để tính giá gói Unlimited theo MỨC (GB tốc độ cao, mức throttle Mbps) trong bảng mức ở Công Thức Datapool.
 * Tổ hợp chưa có trong bảng → null (không đoán). `idx` = vị trí trong bảng mức (ô tham số riêng ở sheet Tính giá).
 */
export function unlimitedFactor(a: Assumptions, amount: number, unit: "MB" | "GB", speedMbps = 10): { idx: number; gbPerDay: number; label: string } | null {
  const mb = Math.round(toMb(amount, unit))
  const levels = levelsOf(a)
  const idx = levels.findIndex(l => l.dataMb === mb && l.speedMbps === speedMbps)
  return idx >= 0 ? { idx, gbPerDay: levels[idx].gbPerDay, label: customUnlimitedLabel(levels[idx]) } : null
}

/**
 * COGS data (USD) của 1 SKU theo bảng COGS BC Datapool:
 *  Fixed = tổng GB × giá/GB × 55% · Daily = GB/ngày × số ngày × giá/GB × 38% · Unlimited = 1.7GB × số ngày × giá/GB.
 * Làm tròn MỘT lần ở tiền cuối (USD, ROUNDUP 2 số lẻ) — KHÔNG làm tròn trung gian ở HKD (Hiếu chốt 2026-10-14; khớp giá đang lưu trong hệ thống).
 */
export function dataCostPool(plan: PlanLine, days: number, pricePerGb: number, a: Assumptions): number {
  let raw: number
  if (plan.kind === "Fixed") raw = pricePerGb * toGb(plan.dataAmount, plan.unit) * a.fixedPct
  else if (plan.kind === "Daily") raw = pricePerGb * toGb(plan.dataAmount, plan.unit) * days * a.dailyPct
  else raw = pricePerGb * (unlimitedFactor(a, plan.dataAmount, plan.unit, plan.speedMbps ?? 10)?.gbPerDay ?? 0) * days
  return raw
}

export function dataCostUsd(plan: PlanLine, days: number, pricePerGb: number, currency: "HKD" | "USD", fx: Fx, a: Assumptions): number {
  const inPoolCurrency = dataCostPool(plan, days, pricePerGb, a)
  return ceil2(currency === "HKD" ? inPoolCurrency / fx.hkdPerUsd : inPoolCurrency)
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
