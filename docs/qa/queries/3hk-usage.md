# Kiểm kê dữ liệu: 3HK Data Usage

> Sinh bởi `web/scripts/qa/queries.mjs`. Ký hiệu «ᴸ» = nguồn nằm trong thư viện (lib) mà route import (một cấp). Mỗi route phải được QA ở G1: tham số → SQL → số, với nguồn đối chiếu độc lập.

Route quét: 3

| Route | Phương thức | Tham số đọc | Bảng gohub_dw | Supabase | Turso | Nguồn ngoài | Hàm lọc | Hàm chi phí/pro-rata | Cache (nocache) | Quyền |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/analytics/3hk-sku-meta` | POST |  |  | skus |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/ncc/3hk-zones` | GET |  |  | ncc_3hk |  |  |  |  | 0× (không nocache) | getServerSession |
| `/api/analytics/query` | POST |  | fact_fulfillment_revenueᴸ, fact_sales_revenueᴸ, dim_order_sourceᴸ, dim_customerᴸ, dim_skuᴸ, dim_locationᴸ | analytics_query_cacheᴸ, app_settingsᴸ, analytics_channel_costsᴸ, analytics_cost_input_settingsᴸ, analytics_channel_group_costsᴸ, analytics_target_planningᴸ | country_codesᴸ |  |  |  | 1× (không nocache) | getServerSession |

## Khoá cache khai báo

_(không)_

## Điểm cần chú ý khi QA (tự phát hiện từ quét)

_(không có)_
