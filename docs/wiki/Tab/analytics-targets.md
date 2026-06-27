# KPI Target Planning (Lập Kế Hoạch Chỉ Tiêu Doanh Số)

Trang thiết lập và giám sát mục tiêu KPI doanh thu hàng tháng cho từng thị trường hoặc phân vùng kinh doanh lớn của GoHub.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/targets` (`web/src/app/(dashboard)/analytics/targets/page.tsx`)
- **API Targets**: `/api/planning/targets` (`web/src/app/api/planning/targets/route.ts`)
- **API Summary**: `/api/analytics/targets-summary` (`web/src/app/api/analytics/targets-summary/route.ts`)

---

## 2. Kiến Trúc Kỹ Thuật & Schema
- **Bảng `analytics_target_planning` (Supabase)**: Lưu trữ các chỉ tiêu doanh số được thiết lập theo từng tháng, năm cho các khu vực hoặc các kênh bán cụ thể.
- **Sửa đổi bảng**: Khắc phục dứt điểm lỗi nghiêm trọng của phiên bản cũ (gọi sai bảng đích sang `target_planning` vốn không tồn tại) bằng cách kết nối chính xác tới bảng `analytics_target_planning` cấu hình ở Migration `v13`.

---

## 3. Vận Hành Nghiệp Vụ
- **Cấu hình chỉ tiêu**: Vai trò quản trị viên có thể nhập chỉ tiêu doanh thu kỳ vọng bằng VND cho các kênh sỉ B2B, bán lẻ B2C trực tiếp trên bảng biểu mẫu Settings.
- **Đối chiếu thực tế**: Hệ thống tự động so sánh số liệu doanh thu tích lũy thực tế lấy từ kho dữ liệu với chỉ tiêu KPI đã lập để vẽ biểu đồ đo lường mức độ hoàn thành nhiệm vụ kinh doanh.

---

## 4. Phân Quyền
- **Xem tiến trình**: Mở rộng cho các vai trò **Admin, Creator, BOD, Manager, Staff**.
- **Chỉnh sửa cấu hình KPI**: Chỉ dành cho vai trò **Admin / Manager / Creator**.\n