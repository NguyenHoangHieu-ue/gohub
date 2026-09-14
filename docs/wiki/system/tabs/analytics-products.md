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
- **🔴 Fix s197 (2026-09-14) — mã nước SKU vẫn dùng logic CŨ, sai ~25% SKU 13 ký tự nhóm chữ** (phát hiện
  qua audit toàn hệ thống logic dữ liệu): `REGION_EXPR` (comment tự nhận "khớp 100% `getDestinationSQL`")
  vẫn branch theo KÝ TỰ ĐẦU (`^[1-6]`/`^E`/`^[A-DF-Z]{3}[0-9]`) — đúng logic đã bị thay ở s195+19 (hàm
  canonical `getDestinationSQL`/`decodeSkuDestinationCode` branch theo ĐỘ DÀI SKU: 14→pos1-3, 15→pos2-4,
  else(13)→pos3-5). Vì code ở đây là FE tự build chuỗi SQL text (không gọi được hàm server-side dùng
  chung), bản fix s195+19 không tự lan tới Products. Ảnh hưởng: chart Top Regions, cột Country Code,
  dropdown filter Destination hiện sai nước cho SKU 13 ký tự nhóm chữ (E/A/D) — vd `ECJPN3DBUNL01` ra
  "CJP" thay vì "JPN". Đã sửa cả 2 chỗ (`REGION_EXPR` dùng chung toàn file + query dropdown Destination
  riêng ở `fetchInitialData`) theo đúng logic LENGTH.
- **s196+21 (2026-09-14) — code-split recharts**: 2 chart (Sales & Units Trend, Top Regions) tách sang
  `products-charts.tsx` (`React.memo` + `next/dynamic({ssr:false})`, cùng pattern `bod-charts.tsx`) —
  trước import `recharts` trực tiếp ở `page.tsx` (1056 dòng). Phát hiện qua audit performance toàn hệ
  thống. Không đổi số liệu/UI.
- **s194+11 (2026-09-06)**: UI — 5 KPI card viết tay → `StatTile`; banner "Month-End Projection" + 2 chart
  (Sales & Units Trend, Top Regions) → `CHART_PALETTE`/`CHART_GRID_COLOR`/`chartTooltipStyle`; `blue-*`→
  `brand-*` (giữ indigo=B2C, slate=B2B Non-Strategic phân biệt nhóm). Không đổi logic/data.
- Region = nước ĐÍCH suy từ mã SKU (KHÔNG phải `dim_location`).
- Created mode → margin = 0.
- Chuỗi filter nội suy trực tiếp (đã escape `'`), không phải param hoá.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` GROUP BY SKU |
| GP (Margin) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` |
| Units | `fact_fulfillment_revenue.fulfilled_quantity` | `SUM(fulfilled_quantity)` |
| Orders | `fact_fulfillment_revenue.order_code` | `COUNT(DISTINCT order_code)` per SKU |
| SKU | `fact_fulfillment_revenue.sku` | Mã sản phẩm gốc |
| Category | `dim_sku.category_name` | JOIN `f.sku = dim_sku.sku` |
| Vendor | `dim_sku.vendor` | JOIN `f.sku = dim_sku.sku` |
| Region (nước đích) | `dim_sku.sku` + `country_codes` (Turso) | Suy từ mã SKU — KHÔNG phải `dim_location` |
| Channel | `dim_order_source.channel_name` + `group_name` | JOIN `f.order_source_code = dim_order_source.code` |
