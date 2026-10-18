# Kiểm kê dữ liệu: Customers

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 3

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/analytics/customer/report` | POST |  | dim_customer, dim_order_source, dim_sku, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ, b2b_customer_cost_monthlyᴸ | country_codesᴸ, b2b_customer_cost_monthlyᴸ |  | getAnalyticsSource | fetchCustomerCosts | 1× (không nocache) · 60s | getServerSession |
| `/api/config/partner-tiers` | GET, POST |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | app_settings, analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 1× (không nocache) | getServerSession |
| `/api/customers` | GET | q | dim_customer, dim_customerᴸ |  |  |  |  |  | 0× (không nocache) | getServerSession |

## Khoá cache khai báo

- `/api/analytics/customer/report`: `${row.order_code}_${row.product_name // row.sku}`

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

- `/api/config/partner-tiers`: có cache nhưng KHÔNG nhận `nocache=1` qua `noCache(req)` → khi đo số tươi có thể ăn bản cũ.
- `/api/config/partner-tiers`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
