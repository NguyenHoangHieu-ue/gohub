---
title: "Customer Performance (Hiệu Suất Khách Hàng B2B)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, customers]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Customer Performance (Hiệu Suất Khách Hàng B2B)

Phân tích khách hàng **sỉ B2B**: doanh thu/margin/số lượng theo từng khách (`dim_customer`), sản phẩm & kênh họ mua. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/customers` — `web/src/app/(dashboard)/analytics/customers/page.tsx` |
| API | `/api/analytics/customer/report`, `/api/customers` |
| Nguồn | fact + `dim_customer` (code, name) · `dim_order_source` · `dim_sku` |

## 2. Logic
- Join `f.customer_code = dim_customer.code` → gom theo khách.
- Trả: `code`, `name`, `revenue`, `margin`, `quantity`, `product_name`, `channel_name`, theo `date`.
- Thường lọc B2B (`group_name='B2B'`).

## 3. Gotchas
- **s194+10 (2026-09-06)**: fix 1 hex sai `#003B95` (tier badge "All Customers Breakdown") → `brand-600`;
  vài chỗ CM1 `text-blue-*`→`brand-*`. KHÔNG đổi theme indigo xuyên suốt trang (bo góc lớn/in nghiêng hoa —
  thiết kế "editorial" riêng biệt có chủ đích từ đầu, giống cách B2C Advanced giữ nguyên Apple-glass style,
  không phải màu ngẫu nhiên cần dọn).
- **KPI `change` (CUST-1, 2026-08-02)**: API trả `change = giá trị tuyệt đối` (currRev − prevRev), KHÁC các tab dùng % thay đổi. Đã kiểm FE: KPI card CHỈ render `label` + `value`, KHÔNG render `change`/`isPositive`/`lastPeriod` → không có lỗi hiển thị. Giữ nguyên (nếu sau này hiện `change` phải rõ là số tuyệt đối, không phải %).
- Khách không map được → hiển thị `TRIM(customer_code)` hoặc "Unknown".
- Created mode → margin = 0.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` GROUP BY customer_code; lọc B2B |
| GP (Margin) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` |
| Units / Quantity | `fact_fulfillment_revenue.fulfilled_quantity` | `SUM(fulfilled_quantity)` |
| Customer Name | `dim_customer.name` | JOIN `TRIM(f.customer_code) = TRIM(dim_customer.code)` |
| Customer Code | `fact_fulfillment_revenue.customer_code` | Fallback: `TRIM(customer_code)` nếu không map được |
| Channel | `dim_order_source.channel_name` | JOIN `f.order_source_code = dim_order_source.code` |
| Product | `dim_sku.type_of_sim` | JOIN `f.sku = dim_sku.sku` |
