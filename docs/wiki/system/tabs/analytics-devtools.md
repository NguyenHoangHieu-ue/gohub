---
title: "Dữ liệu & API (Creator Dev Tools)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, devtools, sql, database]
created: 2026-09-05
updated: 2026-09-20
status: active
---

# Dữ liệu & API (Creator Dev Tools)

Bộ công cụ dữ liệu/kiểm thử nội bộ. Chỉ **Admin** (cần Creator cấp quyền qua Tab Visibility, id `api-database`, mặc định ẩn)
**và Creator**. **s202 (2026-09-20)**: đổi tên "API & Database" → "Dữ liệu & API", gộp tab "Giám sát Dữ liệu" vào (tab con **Giám sát**,
chỉ creator thấy — xem `analytics-data-health.md`) và làm lại SQL Query kiểu Power BI (Query Studio). 5 sub-tab, 1 trang; hỗ trợ `?tab=monitor|sql|api|db|lineage`.

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

### SQL Query — Query Studio (kiểu Power BI, s202)
Chạy truy vấn **SELECT-only** trên `gohub_dw` rồi dựng bảng/biểu đồ ngay trong web, không cần app ngoài. File: `devtools/query-studio.tsx` (UI),
`query-studio-charts.tsx` (Recharts, code-split), `lib/query-studio.ts` (logic thuần, có test `query-studio.test.ts`).
Bố cục 3 cột giống Power BI:
- **Data** (trái): schema `gohub_dw` (bấm tên bảng = `SELECT * … LIMIT 100` + chạy; bấm đúp cột = chèn vào editor).
- **SQL + canvas** (giữa): editor thu gọn được (Ctrl+Enter chạy; bôi đen 1 đoạn thì chỉ chạy đoạn đó; Tab thụt 2 dấu cách), lịch sử 15 query
  (localStorage `qs_history_v1`), toàn màn hình, Export Excel. Canvas hiện visual đang chọn + số dòng/thời gian chạy.
- **Visualizations** (phải): 7 loại — Table, Column, Bar, Line, Area, Donut, Card. **Fields** = các cột kết quả (icon Σ số / lịch ngày / Aa chữ, tự nhận
  diện kiểu vì pg trả numeric/bigint dạng chuỗi). Ô **Axis / Legend / Values** nhận kéo-thả (hoặc chọn từ danh sách); mỗi Value chọn Sum/Average/Count/
  Count distinct/Min/Max; Top N; Stacked. Sau mỗi lần chạy tự gợi ý visual như "Recommended" (1 dòng → Card; có ngày+số → Line; chữ+số → Column);
  chạy lại cùng bộ cột thì giữ nguyên cấu hình visual.
- **Table visual**: click tiêu đề để sắp xếp (số theo giá trị), lọc nhanh, tổng cột số, phân trang 100 dòng, số format vi-VN (cột kiểu id/code/sku giữ nguyên).
- Việc gom nhóm/vẽ là phía client trên kết quả query → muốn tổng theo nhóm với dữ liệu lớn thì `GROUP BY` trong SQL. API `/api/admin/sql-query` giờ **cắt 10.000
  dòng** (trả `truncated`, `rowCount` là số thật) — canvas hiện cảnh báo.
- API: `/api/admin/sql-query` (chặn INSERT/UPDATE/DELETE/DDL, rate-limit 30/phút) + `/api/admin/sql-schema`.
- **Trước s190**: trang riêng `/analytics/sql`, cho phép role `bod`. Sau khi gộp vào Dev Tools (vốn chỉ admin/creator), **bod không còn xem được nữa**.

### Data Map
`DataLineageMap` — sơ đồ trực quan luồng dữ liệu giữa các bảng/tab (component dùng chung, không đổi).

## 3. An toàn
- SQL Query: CHỈ SELECT/WITH — chặn multi-statement, INSERT/UPDATE/DELETE/DDL.
- Toàn trang chỉ admin/creator (admin cần được Creator bật qua Tab Visibility, id `api-database`, mặc định
  nằm trong `DEFAULT_HIDDEN_TABS`).
- Đây cũng là 1 trong các endpoint SELECT-only dùng chung với BI (`/api/analytics/query` là bản khác, tách
  riêng cho mọi tab BI — cùng nguyên tắc an toàn).
