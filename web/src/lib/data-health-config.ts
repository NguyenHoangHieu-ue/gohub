// Danh sách nguồn dữ liệu giám sát cho tab "Giám sát Dữ liệu" (Data Health, creator-only).
// Mở rộng ý tưởng từ `api/analytics/db-status/route.ts` (chỉ hiện trong nút "Kiểm tra database" ở
// Settings) thành cấu hình đầy đủ + ngưỡng cảnh báo, phục vụ trang quan sát trực quan riêng.

export type DataHealthSource = "gohub_dw" | "supabase"

export interface DataHealthEntry {
  key: string
  label: string
  category: "Doanh thu" | "Sản phẩm" | "CS & Vận hành" | "Cấu hình"
  source: DataHealthSource
  table: string
  dateCol: string
  loadCol?: string
  /** Ngưỡng vàng (giờ) — quá mốc này mà chưa đỏ thì cảnh báo nhẹ. */
  warnAfterHours: number
  /** Ngưỡng đỏ (giờ) — quá mốc này coi là trễ thật, cần chú ý. */
  redAfterHours: number
  /** Gợi ý tab liên quan để Hiếu bấm sang xem tiếp. */
  relatedTab?: string
}

export const DATA_HEALTH_ENTRIES: DataHealthEntry[] = [
  {
    key: "fact_fulfillment_revenue", label: "Doanh thu Fulfillment", category: "Doanh thu",
    source: "gohub_dw", table: "fact_fulfillment_revenue", dateCol: "fulfiled_date",
    warnAfterHours: 30, redAfterHours: 48, relatedTab: "/analytics",
  },
  {
    key: "fact_sales_revenue", label: "Doanh thu Sales (Created)", category: "Doanh thu",
    source: "gohub_dw", table: "fact_sales_revenue", dateCol: "created_date", loadCol: "etl_updated_at",
    warnAfterHours: 4, redAfterHours: 8, relatedTab: "/analytics/orders",
  },
  {
    key: "fact_data_usage", label: "3HK Data Usage", category: "CS & Vận hành",
    source: "gohub_dw", table: "fact_data_usage", dateCol: "first_report_date", loadCol: "loaded_at",
    warnAfterHours: 168, redAfterHours: 240, relatedTab: "/analytics/3hk-usage",
  },
  {
    key: "data_usage_log", label: "3HK Usage theo nước (log)", category: "CS & Vận hành",
    source: "gohub_dw", table: "data_usage_log", dateCol: "report_date",
    warnAfterHours: 168, redAfterHours: 240, relatedTab: "/analytics/3hk-usage",
  },
  {
    key: "fact_inventory", label: "Tồn kho (Inventory)", category: "Sản phẩm",
    source: "gohub_dw", table: "fact_inventory", dateCol: "date",
    warnAfterHours: 6, redAfterHours: 12, relatedTab: "/analytics/fulfillment",
  },
  {
    key: "sku_catalog", label: "Catalog SKU (sync GoHub API)", category: "Sản phẩm",
    source: "supabase", table: "sku_catalog", dateCol: "synced_at",
    warnAfterHours: 24, redAfterHours: 30, relatedTab: "/skus",
  },
]

export type FreshnessStatus = "green" | "yellow" | "red" | "unknown"

export function classifyFreshness(delayHours: number | null, entry: DataHealthEntry): FreshnessStatus {
  if (delayHours == null || Number.isNaN(delayHours)) return "unknown"
  if (delayHours >= entry.redAfterHours) return "red"
  if (delayHours >= entry.warnAfterHours) return "yellow"
  return "green"
}
