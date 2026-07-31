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
- **Entity** (VN/US/SG/HK, `company_code`) — pills ở đầu Row 1, badge cột Entity trong bảng.
- **Kênh nhóm** (`s.group_name`), **kênh con**, **staff (PIC)**, **source**, **khoảng ngày** (single day / range).
- **Toggle "Phí ship"**: mặc định **Loại phí ship** (`sku != 'SHIPPINGFEE0'`, đồng bộ toàn hệ thống — phí giao hàng KHÔNG phải doanh thu SP). Bật → param `includeShip=1` bỏ điều kiện đó, doanh thu gồm cả phí ship (khớp bảng raw). Bật/tắt tự re-fetch ngay.
- Loại nhiễu cố định: `staff_name != 'Auto ESIM'`.
- Với role Sales: bỏ join `dim_location` (không xem chi nhánh).

## 3b. KPI & Số liệu (QUAN TRỌNG)
- **KPI Total Revenue/GP = tổng TOÀN KỲ** (API trả `totalRevenue/totalGp/totalQty` qua aggregate SQL riêng), KHÔNG phải chỉ page hiện tại. Khi search (client-side, chỉ lọc page) → KPI đổi sang tổng của rows đang hiện + label "trong kết quả search".
- **Total Orders** = `COUNT(DISTINCT order_code)` (số đơn duy nhất), khác "số dòng" line-item.
- **Đối chiếu tháng 6/2026**: LOẠI ship = 8.978 tỷ (29,048 đơn) · GỒM ship = 9.000 tỷ. Bảng raw đếm dòng (30k+) + gồm ship nên cao hơn ~21M.
- **Export**: loop fetch tất cả page (5000/lần) → xuất ĐỦ mọi đơn, không chỉ 1 page. ORDER BY có tiebreaker `order_code` để phân trang ổn định. Cột Entity có trong file export.

## 4. Gotchas
- 1 `order_code` có thể gồm nhiều dòng (nhiều SIM/SP). Tab Orders GROUP BY order → mỗi đơn 1 row; KPI dùng aggregate toàn kỳ.
- Phí ship (`SHIPPINGFEE0`) mặc định bị loại; toggle để gồm. Khi gồm, số đơn KHÔNG đổi (ship gắn vào đơn có sẵn) nhưng doanh thu tăng.
- Export qua `/api/analytics/order-report?export=1` (loop nhiều page, cùng bộ filter gồm cả includeShip).

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Order Code | `fact_fulfillment_revenue.order_code` | Một đơn có thể nhiều dòng (nhiều SKU) |
| Date | `fact_fulfillment_revenue.fulfiled_date` / `fact_sales_revenue.created_date` | Toggle Fulfillment / Created |
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(fulfilled_revenue_amount_vnd)` per order |
| Quantity | `fact_fulfillment_revenue.fulfilled_quantity` | `SUM(fulfilled_quantity)` |
| Channel | `dim_order_source.channel_name` | JOIN `f.order_source_code = dim_order_source.code` |
| Staff (PIC) | `dim_staff.name` | JOIN `TRIM(f.staff_code) = TRIM(dim_staff.code)` |
| Customer | `dim_customer.name` | JOIN `TRIM(f.customer_code) = TRIM(dim_customer.code)` |
| Product Type | `dim_sku.type_of_sim` | JOIN `f.sku = dim_sku.sku` |
| Company Code | `fact_fulfillment_revenue.company_code` | VN / US / ALL filter |
