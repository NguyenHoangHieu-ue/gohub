# Kiểm kê dữ liệu: Website Analytics

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 3

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/config/ga4` | GET |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | app_settingsᴸ, analytics_query_cacheᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ | GA4, GA4ᴸ, GSCᴸ |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/ga4` | GET | siteId, startDate, endDate, dimensions, metrics, limit, platform |  | app_settingsᴸ |  | GA4, GA4ᴸ, GSCᴸ |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/gsc` | GET | siteId, startDate, endDate, dimensions |  | app_settingsᴸ |  | GA4, GA4ᴸ, GSCᴸ |  |  | 0× (không nocache) | getServerSession |

## Khoá cache khai báo

_(không)_

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

_(không có)_
