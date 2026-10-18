# Kiểm kê dữ liệu: Products (BI)

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 7

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/analytics/query` | POST |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 1× (không nocache) | getServerSession |
| `/api/channels` | GET | channelGroup, tier, withDetails | dim_order_source, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |
| `/api/config/sku-destination-rule` | GET, POST |  |  | app_settings, app_settingsᴸ |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/config/country-codes` | GET |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codes, country_codesᴸ |  |  |  | 1× (không nocache) | getServerSession |
| `/api/analytics/b2b/strategic-performance` | GET | startDate, endDate, dateColumn, companyCode, includeShip, includeInternalOps, includeOpsCustomers | dim_order_source, dim_customer, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  | getAnalyticsSource, getDateFilter, getPrevDateFilter, shipFilter, internalOpsFilter, excludeOpsByCode, excludeInactiveCustomers | getChannelCostsForMonths, rangeDayRatio | 1× (noCache(req)) | getServerSession, analyticsGuard |
| `/api/analytics/win-rate` | GET | days, vendor, win_threshold, win_days | fact_fulfillment_revenueᴸ, dim_skuᴸ | skusᴸ |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/orders/export` | GET | startDate, endDate, search, channel, staff, orderSource, channelGroup, customerTier, dataSource, companyCode, skus, category, vendor, destination, startsWith, codeLength, useGohubVietnamRule, useGohubIncRule | fact_sales_revenue, fact_fulfillment_revenue, dim_sku, dim_location, dim_order_source, dim_staff, dim_customer, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |

## Khoá cache khai báo

- `/api/analytics/b2b/strategic-performance`: `b2b-strategic3:${dateColumn}:${startDate}:${endDate}:${companyCode ?? ""}:${incl`

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

- `/api/channels`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/config/country-codes`: có cache nhưng KHÔNG nhận `nocache=1` qua `noCache(req)` → khi đo số tươi có thể ăn bản cũ.
- `/api/config/country-codes`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/analytics/win-rate`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
