---
title: "Fulfillment Report (Báo Cáo Hoàn Thành Đơn)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, fulfillment]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Fulfillment Report (Báo Cáo Hoàn Thành Đơn)

Tốc độ & chất lượng giao SIM theo tháng / chi nhánh / loại SP. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/fulfillment` — `web/src/app/(dashboard)/analytics/fulfillment/page.tsx` |
| API | `/api/analytics/fulfillment-report` |
| Nguồn | **`fact_fulfillment_revenue`** (bảng fulfillment, cột `fulfiled_date`) + `dim_location` + `dim_sku` |

## 2. Chỉ số trả về
- `month`, `location` (chi nhánh — `dim_location.location_name`), `product_type`.
- `revenue = SUM(fulfilled_revenue_amount_vnd)`, `units = SUM(fulfilled_quantity)`.
- `orders / gross_orders = COUNT(DISTINCT order_code)`, `items_delivery`.

## 3. Gotchas
- Báo cáo này **luôn dùng Fulfillment** (`fact_fulfillment_revenue`) — không có chế độ Created.
- `dim_location` = **chi nhánh**, KHÔNG phải nước đích.
