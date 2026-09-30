import type { Assumptions, Fx, PlanKind } from "./types"

/** Số ngắn gọn cho chuỗi công thức: bỏ đuôi 0, dấu chấm ngăn nghìn kiểu VN cho số lớn. */
const n = (x: number, d = 4) => {
  const s = String(Number(x.toFixed(d)))
  return Math.abs(x) >= 1000 ? Number(x.toFixed(d)).toLocaleString("vi-VN") : s
}
const pct = (x: number) => `${n(x * 100, 2)}%`

export interface ExplainInput {
  kind: PlanKind
  dataAmount: number
  unit: string
  days: number
  pricePerGb: number
  currency: "HKD" | "USD"
  dataPool: number
  dataUsd: number
  feeKind: "esim" | "sim" | "none"
  feeUsd: number
  cogsUsd: number
  cogsVnd: number
  fx: Fx
  a: Assumptions
  imsiFee: number
  esimFeeCny: number
  whiteSimVnd: number
}

export interface CostExplain { dataPool: string; dataUsd: string; fee: string; cogsUsd: string; cogsVnd: string }

/** Chuỗi công thức đã thế số, để hiện khi rê chuột vào giá ở bản xem trước (cùng công thức với sheet "Tính giá" của file xuất). */
export function explainCost(i: ExplainInput): CostExplain {
  const gb = i.unit === "MB" ? `(${n(i.dataAmount, 0)}/1024)` : n(i.dataAmount)
  const dataPool =
    i.kind === "Daily" ? `ROUNDUP(giá/GB ${n(i.pricePerGb)} × ${gb} GB × ${i.days} ngày × ${pct(i.a.dailyPct)}, 2) = ${n(i.dataPool)} ${i.currency}`
    : i.kind === "Fixed" ? `ROUNDUP(giá/GB ${n(i.pricePerGb)} × ${gb} GB × ${pct(i.a.fixedPct)}, 2) = ${n(i.dataPool)} ${i.currency}`
    : `ROUNDUP(giá/GB ${n(i.pricePerGb)} × ${n(i.a.unlimitedGbPerDay)} GB/ngày × ${i.days} ngày, 2) = ${n(i.dataPool)} ${i.currency}`
  const dataUsd = i.currency === "HKD"
    ? `ROUNDUP(${n(i.dataPool)} HKD ÷ ${n(i.fx.hkdPerUsd)}, 2) = ${n(i.dataUsd)} USD`
    : `Pool tính bằng USD nên giữ nguyên = ${n(i.dataUsd)} USD`
  const imsi = i.currency === "HKD" ? `IMSI ${n(i.imsiFee)} HKD ÷ ${n(i.fx.hkdPerUsd)}` : `IMSI ${n(i.imsiFee)} USD`
  const fee =
    i.feeKind === "esim" ? `ROUNDUP(phí eSIM ${n(i.esimFeeCny)} CNY ÷ ${n(i.fx.cnyPerUsd)} + ${imsi}, 2) = ${n(i.feeUsd)} USD`
    : i.feeKind === "sim" ? `ROUNDUP(giá SIM trắng ${n(i.whiteSimVnd, 0)} VND ÷ ${n(i.fx.vndPerUsdInc, 2)} (tỷ giá Inc, VND→USD) + ${imsi}, 2) = ${n(i.feeUsd)} USD`
    : "Gói data rời (datapack): không cộng phí khung = 0"
  const cogsUsd = i.feeKind === "none" ? `ROUNDUP(data ${n(i.dataUsd)}, 2) = ${n(i.cogsUsd)} USD` : `ROUNDUP(data ${n(i.dataUsd)} + phí khung ${n(i.feeUsd)}, 2) = ${n(i.cogsUsd)} USD`
  const cogsVnd = `ROUNDUP(${n(i.cogsUsd)} USD × ${n(i.fx.vndPerUsd, 0)} (tỷ giá JSC, USD→VND), 0) = ${n(i.cogsVnd, 0)} VND`
  return { dataPool, dataUsd, fee, cogsUsd, cogsVnd }
}
