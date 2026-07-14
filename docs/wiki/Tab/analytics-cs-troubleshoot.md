---
title: "CS Troubleshoot Hub (Trung Tâm Khắc Phục Sự Cố CS)"
page_type: tab_guide
department: all
tags: [tab, analytics, cs]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# CS Troubleshoot Hub (Trung Tâm Khắc Phục Sự Cố CS)

Phân hệ cho bộ phận Chăm sóc Khách hàng: tra cứu lịch sử khiếu nại + đồng bộ vé sự cố (tickets) từ Lark.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: CS tra cứu nhanh lịch sử vé sự cố của khách, đối soát và đồng bộ vé mới từ Lark.
- **Tại sao cần**: vé sự cố nằm ở Lark; cần kéo về kho tập trung để tra cứu/thống kê thay vì lục Lark thủ công.

## 2. Đường dẫn & file
- **Web**: `/analytics/cs-troubleshoot` — `web/src/app/(dashboard)/analytics/cs-troubleshoot/page.tsx`
- **API**: `/api/reports/cs-troubleshoot`
- **Sync vé**: `/api/admin/sync-lark-tickets` (có cron Vercel 02:00 UTC hằng ngày từ S78)

## 3. Nguồn dữ liệu & tích hợp Lark
- **Lưu trữ**: bảng `lark_cs_tickets` (Supabase) — ~24,712 bản ghi, đồng bộ từ Turso.
- **Script migrate**: `scripts/migrate_turso_tickets.py` (one-off chuyển dữ liệu cũ).
- **Đồng bộ định kỳ**: cron `sync-lark-tickets` kéo vé mới từ Lark (auth `CRON_SECRET`).

## 4. Tính năng vận hành
- **Phân trang 20 dòng** (`pager.tsx`).
- **2 nút admin**: "Đồng bộ vé từ Lark (Sync)" + "Di chuyển dữ liệu (Migrate)" — chạy trực tiếp trên UI, không cần SSH server.
- **Thông báo lỗi thân thiện**: ẩn lỗi thô → banner *"Hiếu đang fix, vui lòng đợi"*.

## 5. Phân quyền
- **Admin, Creator, Manager, BOD, Staff** (thường cấp cho phòng ops-&-cs). **Standard** không truy cập.
