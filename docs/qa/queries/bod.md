# Kiểm kê dữ liệu: BOD Report

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 7

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/analytics/query` | POST |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 1× (không nocache) | getServerSession |
| `/api/analytics/bod-summary` | GET | startDate, endDate, dateColumn, includeShip, includeInternalOps | dim_sku, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  | getAnalyticsSource, getDateFilter, getBODFilters | getProjectionFactor | 1× (noCache(req)) | getServerSession, analyticsGuard |
| `/api/analytics/bod-report` | GET | startDate, endDate, comparisonType, includeShip, includeInternalOps | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  | getBODFilters |  | 1× (noCache(req)) | getServerSession, analyticsGuard |
| `/api/analytics/bod-group-margin` | GET | startDate, endDate, dateColumn, comparisonType, includeShip, includeInternalOps | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  | getBODFilters |  | 1× (noCache(req)) | getServerSession, analyticsGuard |
| `/api/analytics/bod-channel-performance` | GET | startDate, endDate, dateColumn, comparisonType, includeShip, includeInternalOps | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  | getBODFilters |  | 1× (noCache(req)) | getServerSession, analyticsGuard |
| `/api/analytics/b2b/strategic-performance` | GET | startDate, endDate, dateColumn, companyCode, includeShip, includeInternalOps, includeOpsCustomers | dim_order_source, dim_customer, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  | getAnalyticsSource, getDateFilter, getPrevDateFilter, shipFilter, internalOpsFilter, excludeOpsByCode, excludeInactiveCustomers | getChannelCostsForMonths, rangeDayRatio | 1× (noCache(req)) | getServerSession, analyticsGuard |
| `/api/config/partner-tiers` | GET, POST |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | app_settings, analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 1× (không nocache) | getServerSession |

## Khoá cache khai báo

- `/api/analytics/bod-summary`: `bod-summary2:${dateColumn}:${startDate}:${endDate}:${extraFilters}:${stratHash}:`
- `/api/analytics/bod-report`: `bod-report2:${startDate}:${endDate}:${comparisonType}:${extraFilters}:${includeS`
- `/api/analytics/bod-group-margin`: `bod-group-margin2:${dateColumn}:${startDate}:${endDate}:${comparisonType}:${extr`
- `/api/analytics/bod-channel-performance`: `bod-channel-perf4:${dateColumn}:${startDate}:${endDate}:${comparisonType}:${extr`
- `/api/analytics/b2b/strategic-performance`: `b2b-strategic3:${dateColumn}:${startDate}:${endDate}:${companyCode ?? ""}:${incl`

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

- `/api/config/partner-tiers`: có cache nhưng KHÔNG nhận `nocache=1` qua `noCache(req)` → khi đo số tươi có thể ăn bản cũ.
- `/api/config/partner-tiers`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
