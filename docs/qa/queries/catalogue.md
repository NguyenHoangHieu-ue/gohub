# Kiểm kê dữ liệu: Product Catalogue

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 2

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/analytics/product-catalogue` | GET |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ, ref_countriesᴸ, ref_vendorsᴸ, sync_logᴸ | country_codesᴸ |  |  |  | 1× (noCache(req)) · 60s | getServerSession, analyticsGuard |
| `/api/analytics/product-catalogue/` | GET |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ, ref_countriesᴸ, ref_vendorsᴸ, sync_logᴸ | country_codesᴸ |  |  |  | 1× (noCache(req)) · 60s | getServerSession, analyticsGuard |

## Khoá cache khai báo

_(không)_

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

_(không có)_
