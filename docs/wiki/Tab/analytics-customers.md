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
- Khách không map được → hiển thị `TRIM(customer_code)` hoặc "Unknown".
- Created mode → margin = 0.
