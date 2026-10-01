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
 * Các "mức throttle" của gói Unlimited đang có hệ số GB/ngày. Từ nay gói Unlimited chuyển hết sang kiểu 2 mức throttle
 * (tốc độ cao + phần 5/10Mbps + Unlimited 1Mbps, tổng thường 6GB) thay cho kiểu cũ 1 mốc tốc độ cao + Unlimited (1.6/1.8 — chỉ còn 3HK dùng).
 * Hiện chỉ 1 mức: 3GB tốc độ cao + 3GB 10Mbps + Unlimited 1Mbps = 1.7. Thêm mức mới = thêm 1 dòng ở đây + 1 giả định ở Công Thức Datapool.
 */
export type UnlimitedKey = "unl3gb10"
export const UNLIMITED_PROFILES: { key: UnlimitedKey; dataMb: number; speedMbps: number; label: string }[] = [
  { key: "unl3gb10", dataMb: 3072, speedMbps: 10, label: "3GB tốc độ cao + 3GB 10Mbps + Unlimited 1Mbps" },
]

/** Giả định data thực dùng — lấy từ Admin › Cài đặt › Công Thức Datapool, nhập được trên UI. */
export type Assumptions = { fixedPct: number; dailyPct: number } & Record<UnlimitedKey, number>

export const DEFAULT_ASSUMPTIONS: Assumptions = { fixedPct: 0.55, dailyPct: 0.38, unl3gb10: 1.7 }

export interface PlanLine {
  kind: PlanKind
  /** Fixed/Daily: dung lượng gói. Unlimited: dung lượng tốc độ cao mỗi ngày (chỉ để đặt tên/mã, KHÔNG dùng tính giá). */
  dataAmount: number
  unit: DataUnit
  days: number[]
  productId: string
  /** Chỉ Unlimited: tốc độ (Mbps) của mức throttle giữa — mặc định 10. */
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
