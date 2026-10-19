// Chế độ "Tính giá" của tab Tính giá & Tạo sản phẩm: chỉ trả các dòng giá (không mã SKU/Product, ProductID, file import).

/** Cảnh báo chỉ liên quan tới việc TẠO sản phẩm (mã, ISO, tên, ProductID, trùng mã) — bỏ khỏi chế độ tính giá. */
export const PRICE_ONLY_NOISE = /mã nước|supportedCountries|tên nước|ProductID|Product Code|trùng SKU|trùng Product|KYC|gói data rời \(A\) chỉ tạo|không mã hoá được|chưa có Product 3HK|Plan ID giống|không khớp cấu hình|không có trong file Portal/

interface CostLike {
  type: string; kind: string; dataAmount: number; unit: string; days: number
  pool?: string; operator?: string; network?: string
  pricePerGb?: number; pricePerGbHkd?: number; currency?: string
  dataUsd: number; feeUsd: number; feeVnd?: number; cogsUsd: number; cogsVnd: number
  explain?: object | string
  speedMbps?: number
  skuUS?: string
}

export interface PriceRow {
  type: string
  kind: string
  dataAmount: number
  unit: string
  speedMbps?: number
  days: number
  pool: string
  operator: string
  pricePerGb: number
  currency: string
  dataUsd: number
  feeUsd: number
  feeVnd: number
  cogsUsd: number
  cogsVnd: number
  /** BC: từng bước tính; 3HK: 1 chuỗi tóm tắt */
  explain: object | string
  /** Có giá đầu US (SIM full VN-only thì không) */
  usApplicable: boolean
}

/** Rút gọn dòng giá của builder (BC hoặc 3HK) về các cột giá, bỏ mã SKU/ProductID. */
export function leanPriceRows(rows: CostLike[]): PriceRow[] {
  return rows.map(r => ({
    type: r.type,
    kind: r.kind,
    dataAmount: r.dataAmount,
    unit: r.unit,
    speedMbps: r.speedMbps,
    days: r.days,
    pool: r.pool ?? "3HK",
    operator: r.operator ?? r.network ?? "",
    pricePerGb: r.pricePerGb ?? r.pricePerGbHkd ?? 0,
    currency: r.currency ?? "HKD",
    dataUsd: r.dataUsd,
    feeUsd: r.feeUsd,
    feeVnd: r.feeVnd ?? 0,
    cogsUsd: r.cogsUsd,
    cogsVnd: r.cogsVnd,
    explain: r.explain ?? "",
    usApplicable: r.skuUS === undefined ? true : !!r.skuUS && r.skuUS !== "—",
  }))
}
