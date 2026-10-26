// Danh mục các bảng/cấu hình NHẬP TAY có ghi lịch sử, và cách khôi phục từng loại. Thuần (không import server) để trang quản trị dùng được nhãn.
export type StoreKind = "supabase" | "turso" | "setting" | "json-setting" | "fx"
export interface TableDef {
  label: string
  store: StoreKind
  table?: string                 // supabase/turso: tên bảng
  pk?: string[]                  // supabase/turso: các cột khoá — row_key = giá trị nối bằng "|"
  settingKey?: string            // json-setting: khoá app_settings chứa cả cục JSON (row_key = khoá con, vd "Q4_2026")
  restorable?: boolean           // false: chỉ xem lịch sử, khôi phục bằng tay
}

export const TABLES: Record<string, TableDef> = {
  // Target
  b2b_customer_targets:       { label: "Target B2B theo khách", store: "supabase", table: "b2b_customer_targets", pk: ["id"] },
  target_planning_quarter:    { label: "Target quý theo kênh (B2B/B2C)", store: "turso", table: "target_planning_quarter", pk: ["id"] },
  analytics_target_planning:  { label: "Target kế hoạch theo tháng/kênh", store: "supabase", table: "analytics_target_planning", pk: ["month", "channel"] },
  staff_targets:              { label: "Target nhân viên", store: "supabase", table: "staff_targets", pk: ["staff_code", "month"] },
  squad_targets:              { label: "Target squad", store: "json-setting", settingKey: "squad_targets" },
  company_monthly_targets:    { label: "Target công ty theo tháng", store: "json-setting", settingKey: "company_monthly_targets" },
  okr_manual_targets:         { label: "Target OKR nhập tay (My Metrics)", store: "setting" },
  // Chi phí
  b2b_customer_cost_monthly:  { label: "Chi phí kênh theo khách B2B", store: "turso", table: "b2b_customer_cost_monthly", pk: ["id"] },
  b2b_ecom_cost_monthly:      { label: "Chi phí VN Ecom", store: "turso", table: "b2b_ecom_cost_monthly", pk: ["id"] },
  analytics_channel_costs:    { label: "Chi phí kênh B2C", store: "supabase", table: "analytics_channel_costs", pk: ["channel", "month"] },
  analytics_channel_group_costs: { label: "Chi phí nhóm", store: "supabase", table: "analytics_channel_group_costs", pk: ["id"] },
  analytics_cost_input_settings: { label: "Cách nhập chi phí kênh", store: "supabase", table: "analytics_cost_input_settings", pk: ["channel", "month"] },
  // Tồn kho
  inventory_plan_weekly:      { label: "Kế hoạch tồn kho theo tuần", store: "supabase", table: "inventory_plan_weekly", pk: ["sku_code", "week_start_date"] },
  inventory_po:               { label: "Đơn mua hàng (PO)", store: "supabase", table: "inventory_po", pk: ["id"] },
  inventory_plan_skus:        { label: "SKU theo dõi tồn kho", store: "supabase", table: "inventory_plan_skus", pk: ["sku_code"] },
  // Kế hoạch / ghi chú
  okr_plan_items:             { label: "Kế hoạch quý (My Metrics)", store: "supabase", table: "okr_plan_items", pk: ["id"] },
  okr_sku_tags:               { label: "Ghi chú SKU (My Metrics)", store: "supabase", table: "okr_sku_tags", pk: ["quarter", "sku_code"] },
  // Cấu hình
  fx_rate:                    { label: "Tỷ giá nội bộ theo tháng", store: "fx" },
  app_settings:               { label: "Cài đặt hệ thống (công thức, quyền, ngưỡng…)", store: "setting" },
}

export const tableLabel = (t: string) => TABLES[t]?.label ?? t

/** Có khôi phục tự động được không? (create → không: xoá dòng bằng tay cho chắc). */
export function canRestore(e: { tbl: string; action: string; truncated: boolean }): string | null {
  const d = TABLES[e.tbl]
  if (!d) return "Bảng này chưa hỗ trợ khôi phục tự động."
  if (d.restorable === false) return "Mục này chỉ xem — khôi phục bằng tay."
  if (e.truncated) return "Giá trị cũ quá dài đã bị cắt bớt — không khôi phục nguyên vẹn được."
  if (e.action === "create") return "Mục tạo mới: muốn bỏ thì xoá dòng đó ở màn hình nhập liệu."
  return null
}
