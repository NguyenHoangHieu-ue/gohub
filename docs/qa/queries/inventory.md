# Kiểm kê dữ liệu: Inventory

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 4

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/analytics/inventory-plan/skus` | GET, POST, PATCH, DELETE | company | dim_sku | inventory_plan_skus, app_settingsᴸ |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/inventory-plan/weekly` | GET, POST | company, weeks | fact_inventoryᴸ, fact_fulfillment_revenueᴸ | inventory_plan_skus, inventory_plan_weekly, app_settingsᴸ |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/inventory-po` | GET, POST, PATCH, DELETE | company |  | inventory_po, app_settingsᴸ |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/inventory-stock` | GET |  | fact_inventory, fact_fulfillment_revenue, dim_sku, fact_data_usage, data_usage_log, dim_warehouse, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ, fact_inventoryᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |

## Khoá cache khai báo

- `/api/analytics/inventory-stock`: `${r.warehouse_code}::${r.batch ?? ""}::${r.expired_date ?? ""}`

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

_(không có)_
