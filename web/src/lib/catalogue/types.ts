// Kiểu dữ liệu dùng chung giữa API và giao diện Product Catalogue (bản dựng lại s201, 2026-09-19).
// Nguồn dữ liệu: Supabase products/skus/listings + ref_countries/ref_vendors (KHÔNG gohub_dw, không doanh thu).

/** Loại SIM lấy nguyên từ products.type_of_sim ("eSIM", "SIM", hoặc loại mới sau này). */
export type SimKind = string
/** "fixed" | "daily" cho 2 kiểu đã biết; kiểu mới sau này giữ nguyên chuỗi gốc của products.data_type. */
export type DataKind = string | null

/** Tổng hợp SKU của 1 gói (product) để hiện "1–30 GB · 3–30 ngày" mà không cần tải cả 16k SKU xuống trình duyệt. */
export interface SkuAggregate {
  count: number
  /** Khoảng dung lượng (GB) của các SKU CÓ GIỚI HẠN; null nếu không có SKU nào như vậy. SKU không giới hạn (9999) chỉ bật hasUnlimited. */
  gbMin: number | null
  gbMax: number | null
  hasUnlimited: boolean
  daysMin: number | null
  daysMax: number | null
  /** Các kiểu "hết dung lượng thì sao" khác nhau của SKU (throttle_speed thô, tối đa 4) — để phân biệt các gói trông giống nhau */
  throttles: string[]
}

export interface CatalogueProductLite {
  code: string                // product_code (8 ký tự)
  vendorCode: string
  operatorCode: string | null
  tenant: "VN" | "US" | string
  status: string              // Active | Preparing | Temporary | Inactive | Deleted
  sim: SimKind
  dataKind: DataKind
  network: string | null      // "4G", "4G/5G"…
  carrierRaw: string | null   // onsite_carrier nguyên văn (có thể là đoạn "Nước: Carrier")
  countries: string[]         // mã ISO 2 ký tự
  hotspot: boolean | null
  kycNeeded: boolean | null
  localNumber: boolean | null
  localNumberCountry: string | null
  sku: SkuAggregate
}

export interface CatalogueCountryRef {
  code: string
  name: string                // tên tiếng Anh (ref_countries)
  nameVn: string | null
  continent: string | null
}

export interface CatalogueVendorRef {
  code: string
  name: string
  /** true nếu dòng ref_vendors do sync tự thêm (tên tạm, chưa ai xác nhận) */
  autoAdded?: boolean
}

export interface CatalogueIndex {
  products: CatalogueProductLite[]
  countries: CatalogueCountryRef[]
  vendors: CatalogueVendorRef[]
  /** ISO thời điểm sync gần nhất của bảng products (sync_log) */
  lastSync: string | null
  generatedAt: string
}

export interface CatalogueSkuRow {
  code: string
  status: string
  dataAmount: number | null
  dataUnit: string | null
  days: number | null
  throttle: string | null
  call: string | null
  callDetails: string | null
  vendorSku: string | null
  /** Chỉ có khi vai trò được phép xem giá vốn */
  cogs?: number | null
  cogsCurrency?: string | null
}

export interface CatalogueListingRow {
  code: string
  nameEn: string | null
  nameVn: string | null
  type: string | null
  status: string | null
}

export interface CatalogueProductDetail {
  product: Record<string, unknown>       // toàn bộ cột products (đã bỏ synced_at…)
  skus: CatalogueSkuRow[]
  listings: CatalogueListingRow[]
  canSeeCogs: boolean
}
