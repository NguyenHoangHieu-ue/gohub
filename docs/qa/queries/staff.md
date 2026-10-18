# Kiểm kê dữ liệu: Staff

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 5

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/permissions` | GET |  |  | app_settings |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/channels` | GET | channelGroup, tier, withDetails | dim_order_source, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/staff-report` | GET | startDate, endDate, channelGroup, channel, companyCode, dataSource, includeShip, includeInternalOps | fact_sales_revenue, fact_fulfillment_revenue, dim_customer, dim_staff, dim_order_source, dim_sku, dim_customerᴸ, dim_order_sourceᴸ, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_skuᴸ, dim_locationᴸ | app_settingsᴸ, analytics_query_cacheᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ, b2b_customer_cost_monthlyᴸ | country_codesᴸ, b2b_customer_cost_monthlyᴸ |  | makeExcludeSql, shipFilter, internalOpsFilter, excludeInactiveCustomers | getGroupCostsForMonths, fetchCustomerCosts, calcChCostForPeriod, rangeDayRatio, filterGroupCostsByCompany | 1× (noCache(req)) · 60s | getServerSession, analyticsGuard |
| `/api/analytics/staff-targets` | GET, PATCH | months |  | staff_targets, app_settingsᴸ |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/staff-report/customers` | GET | staffCode, startDate, endDate, channelGroup, channel, companyCode, dataSource, includeShip, includeInternalOps | fact_sales_revenue, fact_fulfillment_revenue, dim_customer, dim_order_source, dim_sku, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ, b2b_customer_cost_monthlyᴸ | country_codesᴸ, b2b_customer_cost_monthlyᴸ |  | shipFilter, internalOpsFilter, excludeInactiveCustomers, makeExcludeSql | fetchCustomerCosts, calcChCostForPeriod, rangeDayRatio | 0× (không nocache) | getServerSession, analyticsGuard |

## Khoá cache khai báo

- `/api/analytics/staff-report`: `staff-report:v4:${startDate}:${endDate}:${channelGroup}:${channel}:${companyCode`

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

- `/api/channels`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
