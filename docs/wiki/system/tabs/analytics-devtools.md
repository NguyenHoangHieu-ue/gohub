---
title: "API & Database (Creator Dev Tools)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, devtools, sql, database]
created: 2026-09-05
updated: 2026-09-05
status: active
---

# API & Database (Creator Dev Tools)

Bộ công cụ kiểm thử/gỡ lỗi nội bộ. Chỉ **Admin** (cần Creator cấp quyền qua Tab Visibility, mặc định ẩn)
**và Creator**. Gồm 4 sub-tab, tất cả trong 1 trang duy nhất.

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/creator/devtools` — `web/src/app/(dashboard)/analytics/creator/devtools/page.tsx` |
| Redirect cũ | `/analytics/sql` → redirect thẳng về đây (SQL Explorer đã gộp vào, s190) |

## 2. 4 Sub-tab

### API Tester
Gửi request thủ công tới bất kỳ route `/api/*` nào (GET/POST/PUT/PATCH/DELETE) — xem response, thời gian
phản hồi. Có danh sách endpoint tự động quét (`/api/config/api-routes`), lưu query hay dùng (localStorage),
lịch sử request gần nhất.

### Database
Duyệt bảng thô Supabase hoặc Turso — chọn bảng, xem dữ liệu phân trang 50 dòng/trang. API:
`/api/config/db/tables` + `/api/config/db/table` (Supabase), `/api/config/db/turso-tables` +
`/api/config/db/turso-table` (Turso).

### SQL Query (gộp từ tab "SQL Explorer" cũ, s190)
Chạy truy vấn **SELECT-only** trực tiếp trên `gohub_dw` để tra cứu ad-hoc. Schema browser bên trái (click
tên bảng → tự điền `SELECT * FROM <bảng> LIMIT 50` và chạy luôn; double-click cột → chèn tên cột vào editor).
- API: `/api/admin/sql-query` (thực thi, chặn INSERT/UPDATE/DELETE/DDL) + `/api/admin/sql-schema` (liệt kê
  bảng/cột từ `information_schema`).
- Nguồn: `gohub_dw` — toàn bộ fact/dim (`fact_fulfillment_revenue`, `fact_sales_revenue`,
  `fact_data_usage`, `dim_sku`, `dim_staff`, `dim_customer`, `dim_order_source`, `dim_location`). Xem
  [[_analytics-data-model]] để biết chi tiết bảng.
- Export kết quả ra Excel (mọi dòng, không chỉ trang hiện tại).
- **Trước s190**: trang riêng `/analytics/sql`, cho phép thêm role `bod` (qua `useRoleGuard(["admin",
  "creator", "bod"])`). Sau khi gộp vào Dev Tools (vốn chỉ admin/creator), **bod không còn xem được nữa** —
  nếu Hiếu cần giữ quyền bod cho riêng SQL Query, báo lại để tách control riêng.

### Data Map
`DataLineageMap` — sơ đồ trực quan luồng dữ liệu giữa các bảng/tab (component dùng chung, không đổi).

## 3. An toàn
- SQL Query: CHỈ SELECT/WITH — chặn multi-statement, INSERT/UPDATE/DELETE/DDL.
- Toàn trang chỉ admin/creator (admin cần được Creator bật qua Tab Visibility, id `api-database`, mặc định
  nằm trong `DEFAULT_HIDDEN_TABS`).
- Đây cũng là 1 trong các endpoint SELECT-only dùng chung với BI (`/api/analytics/query` là bản khác, tách
  riêng cho mọi tab BI — cùng nguyên tắc an toàn).
