---
title: "SQL Explorer (Trình Truy Vấn SQL Nội Bộ)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, sql]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# SQL Explorer (Trình Truy Vấn SQL Nội Bộ)

Chạy truy vấn **SELECT-only** trực tiếp trên `gohub_dw` để tra cứu ad-hoc. Chỉ **Admin, Creator**.

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/sql` — `web/src/app/(dashboard)/analytics/sql/page.tsx` |
| API | `/api/admin/sql-query`, `/api/admin/sql-schema` (liệt kê bảng/cột) |
| Nguồn | `gohub_dw` (toàn bộ fact/dim) |

## 2. An toàn
- **CHỈ SELECT** — chặn INSERT/UPDATE/DELETE/DDL.
- Chỉ role **admin/creator**.
- Đây cũng là endpoint mà các tab BI khác dùng (bản `/api/analytics/query`) — cùng cơ chế SELECT-only.

## 3. Mẹo
- Xem schema: bảng chính ở [[_analytics-data-model]] (fact_fulfillment_revenue, fact_sales_revenue, fact_data_usage, dim_*).
- File `test.sql` ở root có sẵn ví dụ query 3HK.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Query target | `gohub_dw` (Postgres, GCP) | Toàn bộ fact/dim tables: `fact_fulfillment_revenue`, `fact_sales_revenue`, `fact_data_usage`, `dim_sku`, `dim_staff`, `dim_customer`, `dim_order_source`, `dim_location` |
| Schema info | `/api/admin/sql-schema` | Liệt kê bảng + cột từ `information_schema` |
| Execution | `/api/admin/sql-query` | SELECT-only; chặn INSERT/UPDATE/DELETE/DDL |
