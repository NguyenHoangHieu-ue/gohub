# Kiểm kê dữ liệu: Channels

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 11

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/analytics/query` | POST |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 1× (không nocache) | getServerSession |
| `/api/config/country-codes` | GET |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codes, country_codesᴸ |  |  |  | 1× (không nocache) | getServerSession |
| `/api/analytics/channels/b2b-customers` | GET | startDate, endDate, dateColumn | fact_fulfillment_revenue, dim_order_source, dim_customer, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 1× (không nocache) | getServerSession, analyticsGuard |
| `/api/channels` | GET | channelGroup, tier, withDetails | dim_order_source, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/channels/performance` | GET | startDate, endDate, dateColumn, channelGroup | dim_order_source, dim_customerᴸ, dim_order_sourceᴸ, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_skuᴸ, dim_locationᴸ | app_settingsᴸ, analytics_query_cacheᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ, b2b_customer_cost_monthlyᴸ | country_codesᴸ, b2b_customer_cost_monthlyᴸ |  | makeExcludeSql, getAnalyticsSource, getDateFilter, getPrevDateFilter, shipFilter, internalOpsFilter, excludeInactiveCustomers | fetchCosts, fetchCustomerCosts, allocateCustomerCostByKey, rangeDayRatio | 1× (noCache(req)) | getServerSession, analyticsGuard |
| `/api/analytics/channels/kpis` | GET | startDate, endDate, dateColumn, channel, channelGroup, includeShip, includeInternalOps | dim_order_source, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ, b2b_customer_cost_monthlyᴸ | country_codesᴸ, b2b_customer_cost_monthlyᴸ |  | getAnalyticsSource, getDateFilter, getPrevDateFilter, shipFilter, internalOpsFilter, excludeInactiveCustomers, makeExcludeSql | getChannelCostsForMonths, getGroupCostsForMonths, getProjectionFactor, rangeDayRatio, fetchCustomerCosts, allocateCustomerCostByKey | 1× (noCache(req)) | getServerSession, analyticsGuard |
| `/api/channel-costs` | GET, POST | month | dim_order_source, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_channel_costs, analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |
| `/api/channel-group-costs` | GET, POST | month, group | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_channel_group_costs, analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |
| `/api/channel-cost-settings` | GET, POST | month | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_cost_input_settings, analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |
| `/api/config/subchannels` | GET | channel | dim_order_source, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |
| `/api/channel-group-costs/` | GET, POST | month, group | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_channel_group_costs, analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |

## Khoá cache khai báo

- `/api/analytics/channels/b2b-customers`: `ch-b2b-cust:${dateColumn}:${startDate}:${endDate}`
- `/api/analytics/channels/performance`: `ch-perf4:${dateColumn}:${startDate}:${endDate}:${channelGroup}:${exclHash(exclud`
- `/api/analytics/channels/kpis`: `ch-kpis8:${dateColumn}:${startDate}:${endDate}:${channelName}:${channelGroup}:${`

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

- `/api/config/country-codes`: có cache nhưng KHÔNG nhận `nocache=1` qua `noCache(req)` → khi đo số tươi có thể ăn bản cũ.
- `/api/config/country-codes`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/analytics/channels/b2b-customers`: có cache nhưng KHÔNG nhận `nocache=1` qua `noCache(req)` → khi đo số tươi có thể ăn bản cũ.
- `/api/channels`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/channel-costs`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/channel-group-costs`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/channel-cost-settings`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/config/subchannels`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/channel-group-costs/`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
