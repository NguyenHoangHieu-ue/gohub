# Kiểm kê dữ liệu: All-Time Report

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 2

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/channels` | GET | channelGroup, tier, withDetails | dim_order_source, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/all-time-performance` | GET | startDate, endDate, channelGroup, customerTier, channel, includeShip, includeInternalOps | fact_fulfillment_revenue, dim_order_source, dim_customer, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ, b2b_customer_cost_monthlyᴸ | country_codesᴸ, b2b_customer_cost_monthlyᴸ |  | getCustomerStrategicSql, shipFilter, internalOpsFilter, excludeInactiveCustomers | getChannelCostsForMonths, getGroupCostsForMonths, fetchCustomerCosts, calcChCostForPeriod, rangeDayRatio | 1× (noCache(req)) | getServerSession, analyticsGuard |

## Khoá cache khai báo

- `/api/analytics/all-time-performance`: `all-time4:${startDate}:${endDate}:${channelGroup}:${customerTier}:${channel}:${h`, `${period}_${row.derived_group}`

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

- `/api/channels`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
