---
title: "Products BI (Báo Cáo Hiệu Suất Sản Phẩm)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, products]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Products BI (Báo Cáo Hiệu Suất Sản Phẩm)

Doanh số bán theo **SKU**: revenue, units, orders, margin — kèm breakdown theo kênh, vùng (region), category, vendor. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/products` — `web/src/app/(dashboard)/analytics/products/page.tsx` |
| API | `/api/analytics/products/report`, `/api/products/filters` |
| Nguồn | `fact_fulfillment_revenue`/`fact_sales_revenue` + `dim_sku` (category_name, vendor) + `dim_order_source` |

## 2. Các khối trả về (`products/report`)
- **KPI**: `SUM(revenue)`, `COUNT(DISTINCT order_code) AS orders`, `SUM(units)`, `SUM(margin)` — kỳ hiện tại + kỳ trước.
- **Trend theo ngày**: `<dateCol>::date, SUM(revenue), SUM(units)`.
- **Theo kênh**: join `dim_order_source` → `channel_name, group_name`.
- **Theo vùng (region)**: `regionExpr` suy nước đích từ `sku` (xem data-model §3) → top 10.
- **Theo SKU**: `f.sku, v.category_name, v.vendor, region, revenue, units, orders, margin`.

## 3. Bộ lọc
- `category` → `sku IN (SELECT sku FROM dim_sku WHERE category_name = ...)`.
- `vendors` → `sku IN (SELECT sku FROM dim_sku WHERE vendor IN (...))`.
- `channel` → `order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(channel_name)=...)`; hoặc `channelGroup` (B2B/B2C).

## 4. Gotchas
- Region = nước ĐÍCH suy từ mã SKU (KHÔNG phải `dim_location`).
- Created mode → margin = 0.
- Chuỗi filter nội suy trực tiếp (đã escape `'`), không phải param hoá.
