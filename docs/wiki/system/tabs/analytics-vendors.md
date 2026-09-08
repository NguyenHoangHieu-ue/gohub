---
title: "Vendor Performance (Hiệu Suất Nhà Cung Cấp)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, vendors]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Vendor Performance (Hiệu Suất Nhà Cung Cấp)

Doanh thu / margin / units / orders theo **vendor (NCC)** — WorldMove, 3HK DATAPOOL, v.v. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/vendors` — `web/src/app/(dashboard)/analytics/vendors/page.tsx` |
| API | `/api/analytics/vendors/report`, `/api/analytics/vendors/list` |
| Nguồn | fact (Fulfillment/Sales) + `dim_sku` (cột `vendor`) + `dim_order_source` |

## 2. Logic
- Gom doanh thu theo `dim_sku.vendor` (join `f.sku = dim_sku.sku`).
- Trả: `sku` / vendor, `revenue`, `margin`, `units`, `orders` (`COUNT(DISTINCT f.order_code)`), theo `date`, `group_name`.
- Có thể lọc theo nhóm kênh (B2B/B2C).

## 3. Gotchas
- **s195+10 (2026-09-08) — fix bug thật: Channel Distribution phân loại Strategic sai (2 hệ thống
  Strategic khác nhau lệch nhau).** Hiếu báo tiếp "channel strategic mà nó để non-strategic", chỉ tham
  khảo tab Quarter Report. Phát hiện: repo có **2 hệ thống phân loại Strategic hoàn toàn khác nhau**: (1)
  **cũ** — `partner_tiers` (Supabase `app_settings`, sửa qua Settings) = danh sách TÊN kênh/đối tác được
  liệt kê tay, so khớp `channel_name ILIKE ANY(...)` — kênh mới/chưa kịp thêm tay bị rơi mặc định Non-
  Strategic; Vendors + Channels + `b2b/strategic-performance` đang dùng hệ này. (2) **mới, canonical**
  — `quarterly_tier_keywords` (khác key Supabase, sửa ở Quarter Report → "Cấu hình") = MỌI KH B2B mặc định
  **Strategic**, TRỪ KHI `dim_customer.price_list_name` khớp keyword của tier VIP/Gold/Silver — không cần
  liệt kê tay từng KH mới; Quarter Report/Dashboard/BOD/All-Time/B2B tab/Customers/Staff dùng hệ này (xem
  `buildGroupCaseByCustomerSql` trong `lib/analytics-helpers.ts`, comment ghi rõ "1 ĐỊNH NGHĨA DÙNG
  CHUNG"). 2 danh sách lệch nhau theo thời gian → cùng 1 kênh, Quarter Report nói Strategic, Vendors nói
  Non-Strategic. Fix theo đúng yêu cầu Hiếu: đổi `channelSql` trong `page.tsx` sang hệ (2) — fetch
  `/api/analytics/quarterly-settings` (tierKeywords/excludedCustomers) thay vì `/api/config/partner-tiers`,
  JOIN thêm `dim_customer c ON TRIM(f.customer_code)=TRIM(c.code)`, phân loại business_group PHỤ THUỘC
  `c.price_list_name` NÊN PHẢI tách CTE `classified` (phân loại từng dòng) TRƯỚC rồi mới `GROUP BY
  (channel_name, business_group)` ở outer query (không gộp CASE + GROUP BY 1 bước như bản cũ). **Không**
  áp `excludedCustomers` (KH bị Quarter Report loại khỏi B2B, vd "B2B Ops") — trang này không loại KH nào
  khỏi KPI/Revenue Trend/Products, áp riêng ở Channel Distribution sẽ làm tổng bảng lệch KPI card cùng
  trang. Nhân tiện fix 1 bug latent liên quan: bản cũ `SUM(f.${marginCol})` khi ở chế độ Created
  (`marginCol="0"` literal) sẽ thành `SUM(f.0)` không hợp lệ — đổi sang project cột tường minh
  (`marginExpr = marginCol==="0" ? "0" : "f."+marginCol`) trong CTE, không dùng `f.*`. `strategicPerformance`
  (`/api/analytics/b2b/strategic-performance`, danh sách ĐỐI TÁC named cụ thể để drill-down theo tháng)
  CHƯA đổi — vẫn dùng hệ (1), ngoài scope lần này; phần "Other {channel}" residual trong bảng vẫn đúng vì
  chỉ trừ đúng số claimed bởi named partner khỏi tổng channel (không phụ thuộc 2 hệ khớp nhau).
- **s195+9 (2026-09-08) — fix bug thật: bảng Channel Distribution trống do lỗi GROUP BY.** Hiếu báo tiếp
  "bảng Channel Distribution không có dữ liệu" (sau khi đã fix vendor mặc định ở s195+8). `channelSql`
  trong `fetchData()` (`page.tsx`) SELECT `${bizGroupSQL} as business_group` (CASE dùng `s.group_name`) —
  nhưng `GROUP BY` chỉ có `s.channel_name`, KHÔNG có `s.group_name` → Postgres strict lỗi "column
  dim_order_source.group_name must appear in the GROUP BY clause". Query fail (400) nhưng chỉ
  `console.error`, không có banner lỗi cho riêng bảng này → `channelDistribution` không set, đứng yên `[]`
  → bảng trống trông như "không có dữ liệu"; đồng thời `throw` này chặn luôn phần xử lý sau nó trong cùng
  hàm (không ảnh hưởng KPI/Trend/Products vì đã set state trước đó). Fix: thêm `s.group_name` vào
  `GROUP BY`. Không đổi logic phân loại B2B-Strategic/Non-Strategic/B2C nào khác.
- **s195+8 (2026-09-08) — fix bug thật: trang hiện toàn số 0 do auto-chọn sai vendor mặc định.** Hiếu báo
  tab Vendors "không hiện số liệu". `fetchVendors()` (`page.tsx`) tự chọn vendor mặc định bằng
  `list.includes("3HKDATAPOOL")` (KHÔNG dấu cách) — nhưng DB lưu `'3HK DATAPOOL'` (CÓ dấu cách, xem gotcha
  dưới) nên KHÔNG BAO GIỜ khớp, luôn rơi về `list[0]` (vendor đầu bảng chữ cái — thường vendor nhỏ/ít bán
  trong kỳ mặc định) → mọi KPI/chart hiện 0, trông như "lỗi". Bug có từ commit port gốc (`9c2dbca1`), không
  phải regression của đợt UI redesign gần đây. Fix: so khớp bỏ dấu cách + hoa/thường
  (`v.replace(/\s+/g,"").toUpperCase()==="3HKDATAPOOL"`), fallback `list[0]` chỉ khi thật sự không có
  3HKDATAPOOL. Không đổi logic query nào khác.
- **s194+10 (2026-09-06)**: UI redesign — hero "Month-End Projection" banner gradient `blue-600/700`→
  `brand-600/700`; 5 KPI card viết tay đổi sang `StatTile`; chart Revenue Trend đổi sang `CHART_PALETTE`/
  `CHART_GRID_COLOR`/`chartTooltipStyle`; `blue-*`→`brand-*` toàn trang (giữ indigo/purple/amber phân biệt
  Orders/Units Sold/Gross Margin, đúng tiền lệ Channels). Không đổi logic/data.
- **Vendor 3HK** lưu `'3HK DATAPOOL'` (có dấu cách) → lọc `REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL'`.
- Created mode → margin = 0.
- Đây là hiệu suất **bán ra theo vendor** (không phải giá vốn/COGS catalog — cái đó ở SP Hệ Thống).

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` GROUP BY vendor |
| GP (Margin) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` per vendor |
| Units | `fact_fulfillment_revenue.fulfilled_quantity` | `SUM(fulfilled_quantity)` |
| Orders | `fact_fulfillment_revenue.order_code` | `COUNT(DISTINCT order_code)` per vendor |
| Vendor | `dim_sku.vendor` | JOIN `f.sku = dim_sku.sku`; vd `'3HK DATAPOOL'`, `'WorldMove'` |
| Channel Group | `dim_order_source.group_name` | JOIN `f.order_source_code = dim_order_source.code`; B2B / B2C filter |
