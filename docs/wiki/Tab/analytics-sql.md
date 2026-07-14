---
title: "SQL Explorer (Trình Truy Vấn SQL Nội Bộ)"
page_type: tab_guide
department: tech
tags: [tab, admin, sql]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# SQL Explorer (Trình Truy Vấn SQL Nội Bộ)

Trình chạy truy vấn trực tiếp lên kho `gohub_dw` (PostgreSQL) dành cho quản trị viên/chuyên viên phân tích cao cấp.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: tra cứu/khám phá dữ liệu ad-hoc mà các tab báo cáo dựng sẵn chưa cover (kiểm chứng số liệu, debug nghiệp vụ, lấy số liệu nhanh).
- **Tại sao cần read-only chặt**: truy cập thẳng kho dữ liệu sản xuất → 1 lệnh sai (DELETE/DROP) có thể phá data → bắt buộc chỉ cho SELECT.

## 2. Đường dẫn & file
- **Web**: `/analytics/sql` — `web/src/app/(dashboard)/analytics/sql/page.tsx`
- **API**: `/api/admin/sql-query` (chạy query), `/api/admin/sql-schema` (xem schema)

## 3. Bảo mật & kỹ thuật (tại sao làm vậy)
- **Chỉ SELECT/WITH**: parser chỉ chấp nhận câu bắt đầu bằng `SELECT` hoặc `WITH`.
- **Cấm tuyệt đối**: `DROP, DELETE, UPDATE, INSERT, ALTER, TRUNCATE` và multi-statement (`;`) → từ chối + trả mã lỗi bảo mật. **Tại sao chặn `;`**: tránh "stacked queries" nối lệnh phá hoại sau SELECT.
- **Hiển thị lỗi SQL thô**: KHÁC các tab BI (ẩn lỗi + banner "Hiếu đang fix") — ở đây giữ lỗi Postgres thật để analyst sửa cú pháp nhanh.

## 4. Phân quyền
- Chỉ **Admin & Creator** (creator = super-admin, đã thêm trong sweep S79 — trước đó hardcode admin-only khiến creator bị 403).
- BOD/Manager/Staff/Standard: chặn tuyệt đối (tránh lộ cấu trúc DB nội bộ).
