# Kiểm kê dữ liệu: B2B — VN Ecom theo thời gian

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 1

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/analytics/b2b/ecom-timeline` | GET | granularity, year, month, dateColumn, includeShip | dim_customer, dim_sku, dim_staff, fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ, b2b_ecom_cost_monthlyᴸ |  | getAnalyticsSource, getDateFilter, shipFilter |  | 1× (noCache(req)) | getServerSession, analyticsGuard |

## Khoá cache khai báo

- `/api/analytics/b2b/ecom-timeline`: `b2b-ecom-tl1:${dateColumn}:${includeShip ? 1 : 0}:${range.start}:${range.end}`

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

_(không có)_
