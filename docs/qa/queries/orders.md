# Kiểm kê dữ liệu: Orders

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 5

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/analytics/quarterly-settings` | GET, POST |  | dim_customerᴸ, dim_order_sourceᴸ | app_settings, app_settingsᴸ |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/staff` | GET | channel, channelGroup | dim_staff, fact_fulfillment_revenue, dim_order_source |  |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/channels` | GET | channelGroup, tier, withDetails | dim_order_source, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 0× (không nocache) | getServerSession |
| `/api/order-sources` | GET | channel, channelGroup | dim_order_source |  |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/order-report` | GET | date, startDate, endDate, staffCode, channelGroup, channel, orderSource, companyCode, dataSource, includeShip, includeInternalOps, export, page, limit | fact_sales_revenue, fact_fulfillment_revenue, dim_staff, dim_customer, dim_sku, dim_order_source, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 1× (không nocache) · 60s | getServerSession, analyticsGuard |

## Khoá cache khai báo

- `/api/analytics/order-report`: `order-report:v1:${startDate}:${endDate}:${staffCode}:${channelGroup}:${channel}:`

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

- `/api/analytics/quarterly-settings`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/channels`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
- `/api/analytics/order-report`: có cache nhưng KHÔNG nhận `nocache=1` qua `noCache(req)` → khi đo số tươi có thể ăn bản cũ.
