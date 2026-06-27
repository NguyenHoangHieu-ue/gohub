# Scheduled Messages (Lịch Gửi Báo Cáo Tự Động)

Hệ thống đặt lịch hẹn giờ gửi tóm tắt báo cáo doanh số, tiến độ chạy mục tiêu tự động đến các kênh hoặc nhóm thảo luận của bộ phận CS, Sales trên ứng dụng Lark.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/scheduled` (`web/src/app/(dashboard)/analytics/scheduled/page.tsx`)
- **API Scheduled**: `/api/admin/scheduled-messages` (`web/src/app/api/admin/scheduled-messages/route.ts`)
- **API Cron Job**: `/api/cron/scheduled-messages` (`web/src/app/api/cron/scheduled-messages/route.ts`)

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
3. **Biên soạn báo cáo**:
   - Máy chủ API kiểm tra các lịch hẹn giờ đến hạn gửi.
   - Kéo số liệu mới nhất từ kho dữ liệu `gohub_dw`, biên soạn thành thông điệp tóm tắt ngắn gọn kèm biểu tượng trực quan.
4. **Gửi tin nhắn qua Lark Bot**:
   - Sử dụng helper kết nối Lark API `lib/lark.ts` để bắn thông điệp trực tiếp vào nhóm chat của công ty.

---

## 3. Phân Quyền
- Quyền truy cập cài đặt: **Admin và Creator**.
- BOD Report được loại trừ khỏi danh sách hiển thị mặc định của trang này để tránh rò rỉ số liệu tài chính cấp cao đến các nhóm trò chuyện đại trà.\n