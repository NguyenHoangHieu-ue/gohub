// Nguồn chung cho ma trận quyền analytics (dùng bởi layout server, /api/config/role-permissions,
// và sidebar). Tránh drift giữa các bản sao trước đây.

// 20 trang analytics phân quyền được (khớp REPORTS ở users/admin + ANALYTICS_GROUPS ở sidebar)
export const ALL_ANALYTICS_IDS = [
  "dashboard", "quarterly", "bod", "all-time", "channels", "b2b", "b2c", "website",
  "staff", "customers", "vendors", "orders", "fulfillment", "3hk-usage",
  "cs-troubleshoot", "feedback", "products", "targets", "sql", "scheduled", "info",
]

// Quyền NỀN mặc định theo role (admin = toàn quyền, không liệt kê). Deny-by-default;
// per-user allowed_analytics cộng dồn thêm. Admin có thể sửa trong Users / Settings.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  bod:        ALL_ANALYTICS_IDS, // BOD xem toàn bộ analytics (scheduled đã tách riêng management)
  staff:      ["dashboard", "feedback", "products"],
  b2b:        ["dashboard", "quarterly", "b2b", "vendors", "channels", "customers", "targets"],
  b2c:        ["dashboard", "quarterly", "b2c", "channels", "website", "products", "customers"],
  saleb2c:    ["dashboard", "b2c", "channels", "website"],
  "ops-&-cs": ["dashboard", "orders", "fulfillment", "cs-troubleshoot", "feedback", "3hk-usage"],
  hr:         ["dashboard", "staff"],
  product:    ["dashboard", "products", "3hk-usage", "vendors", "all-time"],
}
