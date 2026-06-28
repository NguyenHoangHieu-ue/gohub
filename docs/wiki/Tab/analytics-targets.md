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
- **(s82) Gộp thêm 2 mục cấu hình từ Admin về đúng chỗ tại trang này**:
  - **KPI Target B2C (theo thị trường)**: target doanh thu B2C theo tháng × VN/US/Total — `b2c_kpi_targets` qua `/api/config/b2c-kpi-targets`; hiển thị ở tab KPI của `/analytics/b2c`.
  - **Ngân sách Marketing B2C**: ngân sách kế hoạch theo tháng (VND) — `b2c_budget` qua `/api/config/b2c-budget`; dùng tính spend pace (chi phí thực tế ÷ ngân sách) ở Section 5 `/analytics/b2c`. Có dòng tổng 6 tháng.

---

## 4. Phân Quyền
- **Xem tiến trình**: Mở rộng cho các vai trò **Admin, Creator, BOD, Manager, Staff** (view-only).
- **Chỉnh sửa cấu hình KPI**: Chỉ dành cho vai trò **Admin / Creator** (s82: đã fix creator trước đây bị kẹt view-only — `canEdit = admin || creator`; áp cho cả 3 bảng planning + KPI B2C + Ngân sách B2C).\n