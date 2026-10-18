# Kiểm kê dữ liệu: CS Troubleshoot

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 2

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/reports/cs-troubleshoot` | GET | startDate, endDate, channelGroup | dim_order_source, fact_fulfillment_revenue, dim_sku, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | lark_cs_tickets, analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ | Lark |  |  | 0× (không nocache) | getServerSession |
| `/api/admin/sync-lark-tickets` | POST, GET |  |  | lark_cs_tickets, app_settingsᴸ, usersᴸ, notificationsᴸ |  | Lark |  |  | 0× (không nocache) · 300s | getServerSession |

## Khoá cache khai báo

_(không)_

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

- `/api/reports/cs-troubleshoot`: đọc gohub_dw nhưng không import hàm lọc chuẩn → kiểm bộ lọc ship/nội bộ/Inactive/loại trừ.
