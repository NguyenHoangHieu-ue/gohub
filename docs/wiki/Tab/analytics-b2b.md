# B2B Performance (Hiệu Suất Bán Sỉ B2B)

Báo cáo chi tiết về tình hình kinh doanh kênh đại lý B2B, quản lý chi phí phát sinh và so sánh hiệu quả giữa các nhóm đại lý chiến lược và thông thường.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/b2b` (`web/src/app/(dashboard)/analytics/b2b/page.tsx`)
- **API KPIs**: `/api/analytics/b2b/kpis` (`web/src/app/api/analytics/b2b/kpis/route.ts`)
- **API Performance**: `/api/analytics/b2b/performance` (`web/src/app/api/analytics/b2b/performance/route.ts`)
- **API Strategic**: `/api/analytics/b2b/strategic-performance` (`web/src/app/api/analytics/b2b/strategic-performance/route.ts`)
- **API Trend**: `/api/analytics/b2b/trend` (`web/src/app/api/analytics/b2b/trend/route.ts`)

---

## 2. Quy Tắc Nghiệp Vụ & Phân Tầng Đối Tác (Strategic vs Non-Strategic)
Kênh bán sỉ B2B của GoHub chia đại lý làm 2 tầng để tính chiết khấu và báo cáo riêng biệt:
- **B2B-Strategic (Đại lý chiến lược)**: Nhóm đối tác sỉ có doanh số lớn, được cam kết chiết khấu và ưu tiên nguồn lực. Phân biệt thông qua trường nhóm đối tác được cấu hình sẵn tại `app_settings` (phần Partner Tiers).
- **B2B-Non-Strategic (Đại lý sỉ nhỏ/thường)**: Nhóm đại lý bán tự do, áp dụng biểu phí sỉ tiêu chuẩn.

*Thuật toán loại trừ trùng lắp dữ liệu (Dedup Strategic)*:
- Đảm bảo doanh số của đại lý chiến lược không bị tính hai lần khi tổng hợp báo cáo kênh chung (sử dụng các hàm SQL helper tối ưu `getGroupCaseSQL` và `getFilteredOtherTiers`).

---

## 3. Các Công Thức Kinh Doanh & Tính Năng Vận Hành
- **Margin %**: Tỷ lệ biên lợi nhuận gộp của đại lý.
- **Delta Pill**: Nút hiển thị biến động tăng trưởng xanh/đỏ chính xác theo tỷ lệ thực tế thay vì mặc định luôn xanh như các phiên bản cũ.
- **Quản lý Chi phí Kênh sỉ (Manage Costs)**: Cho phép cấu hình, lưu trữ chi phí phát sinh riêng của kênh B2B trực tiếp tại giao diện cài đặt thông qua `CostManagementModal`.
- **Export PDF / Screenshot**: Cho phép lưu trữ nhanh báo cáo B2B dưới dạng văn bản cứng bằng cách tích hợp thư viện `jspdf` và `modern-screenshot`.

---

## 4. Phân Quyền
- Vai trò truy cập: **Admin, Creator, BOD, Manager, Staff**.
- Standard user bị chặn hoàn toàn.\n