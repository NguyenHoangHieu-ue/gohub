---
title: "Scheduled Messages (Lịch Gửi Báo Cáo Tự Động)"
page_type: tab_guide
is_hidden: true
department: tech
tags: [tab, admin, scheduled]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# Scheduled Messages (Lịch Gửi Báo Cáo Tự Động)

Hệ thống đặt lịch hẹn giờ gửi tóm tắt báo cáo doanh số, tiến độ chạy mục tiêu tự động đến các kênh hoặc nhóm thảo luận của bộ phận CS, Sales trên ứng dụng Lark.

> **Mục đích & vai trò**: tự động đẩy báo cáo định kỳ vào nhóm Lark (không cần ai mở web) → team luôn nắm số liệu mới. **Tại sao tách quyền XEM vs SỬA (S81)**: ai được cấp tab cũng cần thấy lịch đang chạy (minh bạch, tránh trùng lịch), nhưng chỉ admin/creator được sửa để tránh phá lịch của người khác.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/scheduled` (`web/src/app/(dashboard)/analytics/scheduled/page.tsx`)
- **API Scheduled**: `/api/admin/scheduled-messages` (`web/src/app/api/admin/scheduled-messages/route.ts`)
- **API Cron Job**: `/api/cron/scheduled-messages` (`web/src/app/api/cron/scheduled-messages/route.ts`)
- **Runner (chạy 1 báo cáo)**: `web/src/lib/scheduled-runner.ts` — dùng chung cho nút Test (POST) và cron.
- **Số liệu tính sẵn**: `web/src/lib/scheduled-report-data.ts` — SQL cố định đúng định nghĩa Dashboard.

---

## 2. Thiết Kế Hạ Tầng & Quy Trình Gửi Tự Động

### A. Thiết Kế Cơ Sở Dữ Liệu
Dữ liệu lịch hẹn giờ lưu tại bảng `lark_scheduled_messages` trong Supabase (Migration `v15`):
- `id`: Định danh khóa chính.
- `report_type`: Thể loại báo cáo cần gửi (Ví dụ: báo cáo doanh thu ngày, báo cáo tiến độ KPI tuần).
- `cron_expression`: Chu kỳ thời gian lặp lại (Ví dụ: gửi lúc 8:00 sáng hàng ngày).
- `chat_id` / `channel`: Định danh nhóm hoặc kênh chat đích trên Lark.
- `is_active`: Trạng thái hoạt động của lịch gửi.

### B. Quy Trình Vận Hành (Cron Pipeline)
1. **Đặt lịch**: Người quản trị thiết lập khung giờ, loại báo cáo và chọn nhóm chat đích trên giao diện cài đặt.
2. **Kích hoạt tự động (GitHub Actions)**:
   - Một tiến trình tự động chạy ngầm (GitHub Actions Cron) được kích hoạt định kỳ.
   - Tiến trình này gửi yêu cầu HTTP POST bảo mật đến đầu cuối `/api/cron/scheduled-messages`.
3. **Biên soạn báo cáo (kiến trúc precompute — S85)**:
   - Máy chủ API kiểm tra các lịch hẹn giờ đến hạn gửi.
   - `scheduled-report-data.ts` TÍNH SẴN toàn bộ số liệu bằng SQL cố định (đúng định nghĩa Dashboard, dùng chung
     helper `getDateFilter` / `fetchBODGroupMarginData`) — tách thị trường **VN / US / Tổng** theo `company_code`,
     kèm so sánh kỳ trước (MoM/WoW), pro-rata target, 3HK Contribution %; bản Daily thêm ma trận 3 ngày + top khách
     B2B + kênh B2C. Kỳ (daily/weekly/monthly) suy từ `cron_expression`/tên lịch qua `inferPeriod()`.
   - Khối số liệu này được nhồi vào prompt → **Gemini (BI Analyst) chỉ FORMAT, KHÔNG tự chạy SQL** (1 vòng gọi).
     **Tại sao đổi**: trước đây để Gemini tự sinh SQL nhiều vòng → báo cáo Daily dễ timeout và số có thể lệch Dashboard.
4. **Gửi tin nhắn qua Lark Bot**:
   - Sử dụng helper kết nối Lark API `lib/lark.ts` để bắn thông điệp trực tiếp vào nhóm chat của công ty.

> **Timeout**: cron route cấu hình `maxDuration: 60` trong `web/vercel.json`; nút "Test ngay" (`[id]/route.ts`)
> set `export const maxDuration = 60` inline (route này không nằm trong vercel.json).

---

## 3. Phân Quyền
- **XEM (GET)**: mọi role được cấp tab `scheduled` (qua `role_permissions`/`allowed_analytics`, layout enforce) đều thấy **TẤT CẢ** lịch hiện có + cột **Người tạo** (`created_by`). API GET dùng `VIEW_ROLES` (toàn bộ role analytics), không lọc theo người tạo.
- **SỬA/XÓA/BẬT-TẮT/TEST (POST/PUT/DELETE)**: chỉ **Admin & Creator**. Người chỉ-xem không thấy nút thao tác (read-only).
- `created_by` lưu khi tạo (POST). Trang `/analytics/scheduled` (cột Người tạo) + admin ScheduledTab (badge người tạo) đều hiển thị.
