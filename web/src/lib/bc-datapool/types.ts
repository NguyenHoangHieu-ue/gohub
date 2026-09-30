export type Pool = "CMHK" | "SINGTEL"
export type PlanKind = "Daily" | "Fixed" | "Unlimited"
export type DataUnit = "MB" | "GB"
export type SimType = "eSIM" | "SIM"

/** 1 dòng trong bảng báo giá của BC Datapool (mỗi nhà mạng của mỗi khu vực). */
export interface PriceRow {
  coverage: string
  operator: string
  plmn: string
  pricePerGb: number
  kyc: boolean
}

/** Bảng báo giá 1 pool. Giá theo `currency`/GB; phí IMSI cùng tiền tệ với giá. */
export interface PoolPriceList {
  currency: "HKD" | "USD"
  rows: PriceRow[]
  imsiFee: number
  esimFeeCny: number
  simFeeCny: number
}

export interface PriceList {
  fileName: string
  uploadedAt: string
  /** Thay đổi so với bảng giá trước (gắn khi upload để xem lại sau) */
  lastDiff?: import("./diff").PriceDiff
  pools: Record<Pool, PoolPriceList>
}

/** Tỷ giá theo quy tắc chiều đổi (lib/fx/table.ts): USD→VND dùng JSC, VND→USD dùng Inc, HKD/CNY↔USD dùng Inc. */
export interface Fx {
  hkdPerUsd: number
  cnyPerUsd: number
  /** VND cho 1 USD — tỷ giá Gohub JSC, dùng khi đổi USD → VND */
  vndPerUsd: number
  /** VND cho 1 USD — tỷ giá Gohub Inc, dùng khi đổi VND → USD (VD giá SIM trắng) */
  vndPerUsdInc: number
}

/**
 * Giả định data thực dùng — lấy từ Admin › Cài đặt › Công Thức Datapool, nhập được trên UI.
 * Unlimited: GB/ngày phụ thuộc tổ hợp (data tốc độ cao, tốc độ Unlimited): 500MB+5Mbps · 500MB+10Mbps · 3GB+10Mbps.
 */
export interface Assumptions {
  fixedPct: number
  dailyPct: number
  unl500mb5: number
  unl500mb10: number
  unl3gb10: number
}

export const DEFAULT_ASSUMPTIONS: Assumptions = { fixedPct: 0.55, dailyPct: 0.38, unl500mb5: 1.6, unl500mb10: 1.8, unl3gb10: 1.7 }

export interface PlanLine {
  kind: PlanKind
  /** Fixed/Daily: dung lượng gói. Unlimited: dung lượng tốc độ cao mỗi ngày (chỉ để đặt tên/mã, KHÔNG dùng tính giá). */
  dataAmount: number
  unit: DataUnit
  days: number[]
  productId: string
  /** Chỉ Unlimited: tốc độ (Mbps) sau khi hết data tốc độ cao — 10 (mặc định) hoặc 5. */
  speedMbps?: number
  /**
   * Chỉ Unlimited: gói BC thật = "Daily {bcAmount}{bcUnit} Throttle to 1Mbps" (tổng, thường 6GB = tốc độ cao + tốc độ N Mbps + Unlimited 1Mbps).
   * Không có thì mặc định bằng 2× dung lượng tốc độ cao (kiểu 3GB → gói 6GB).
   */
  bcAmount?: number
  bcUnit?: DataUnit
}

export interface ProductInput {
  pool: Pool
  simType: SimType
  /** Khu vực (Coverage) trong bảng báo giá dùng để lấy giá. */
  coverages: string[]
  /** Khoá "Coverage|Operator" các nhà mạng được chọn — giá tính = nhà mạng ĐẮT NHẤT trong số đã chọn. */
  operators: string[]
  supportCountryCode: string
  isoCodes: string
  countryNameEn: string
  countryNameVn: string
  plans: PlanLine[]
}

export interface BuiltSheets {
  skuUS: (string | number)[][]
  skuVN: (string | number)[][]
  productUS: (string | number)[][]
  productVN: (string | number)[][]
}
