---
title: "Orders Management (Quản Lý Đơn Hàng BI)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, orders]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Orders Management (Quản Lý Đơn Hàng BI)

Danh sách đơn hàng chi tiết (order_code, ngày, SP, số lượng, doanh thu, kênh, staff, khách) + tổng hợp count/revenue/units. Có export. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/orders` — `web/src/app/(dashboard)/analytics/orders/page.tsx` |
| API | `/api/orders` (list + totals), `/api/orders/export` (CSV), `/api/order-sources`, `/api/staff-list` |
| Nguồn | `fact_fulfillment_revenue`/`fact_sales_revenue` + `dim_order_source` · `dim_staff` · `dim_customer` · `dim_sku` · `dim_location` |

## 2. Query (rút gọn — `/api/orders`)
```sql
SELECT f.order_code, f.company_code, f.<dateCol> AS fulfiled_date,
       v.type_of_sim AS product_name, f.<quantityCol> AS fulfilled_quantity,
       f.<revenueCol> AS fulfilled_revenue_amount_vnd,
       TRIM(s.channel_name) AS channel_name, s.name AS order_source,
       COALESCE(st.name, TRIM(f.staff_code), 'Unknown') AS staff_name,
       COALESCE(c.name,  TRIM(f.customer_code),'Unknown') AS customer_name
FROM <mainTable> f
LEFT JOIN dim_order_source s ON f.order_source_code = s.code
LEFT JOIN dim_staff  st ON TRIM(f.staff_code)    = TRIM(st.code)
LEFT JOIN dim_customer c ON TRIM(f.customer_code) = TRIM(c.code)
LEFT JOIN dim_sku v ON f.sku = v.sku
WHERE 1=1 <filters>;
```
Totals: `COUNT(*)`, `SUM(revenueCol)`, `SUM(quantityCol)`.

## 3. Bộ lọc
- **Kênh nhóm** (`s.group_name`), **kênh con**, **staff**, **khoảng ngày**, **thị trường** (company_code).
- Loại nhiễu: `staff_name != 'Auto ESIM'` và `sku != 'SHIPPINGFEE0'`.
- Với role Sales: bỏ join `dim_location` (không xem chi nhánh).

## 4. Gotchas
- 1 `order_code` có thể gồm nhiều dòng (nhiều SIM/SP) → totals đếm dòng, không phải đơn duy nhất; "orders" ở tab khác dùng `COUNT(DISTINCT order_code)`.
- Export CSV qua `/api/orders/export` (cùng filter).
