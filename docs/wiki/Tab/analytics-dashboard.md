# BI Dashboard (Bảng Điều Khiển Tổng Quan)

Trang số liệu kinh doanh tổng đài, cung cấp cái nhìn toàn diện về doanh thu thực tế, dự phóng cuối tháng và theo dõi sát sao tiến độ đạt mục tiêu KPI.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics` (`web/src/app/(dashboard)/analytics/page.tsx`)
- **API KPIs**: `/api/analytics/kpis` (`web/src/app/api/analytics/kpis/route.ts`)
- **API Biểu đồ doanh thu**: `/api/analytics/revenue-chart` (`web/src/app/api/analytics/revenue-chart/route.ts`)
- **API Biểu đồ vùng**: `/api/analytics/region-chart` (`web/src/app/api/analytics/region-chart/route.ts`)

---

## 2. Nguồn Dữ Liệu & Kiến Trúc
Bảng điều khiển kết nối trực tiếp đến kho dữ liệu `gohub_dw` (PostgreSQL nội bộ) thông qua lớp kết nối tối ưu `web/src/lib/analytics-db.ts`.

### Các bảng dữ liệu chính được truy vấn:
- `fact_sales_revenue`: Doanh thu bán hàng thực tế.
- `analytics_target_planning`: Bảng lưu cấu hình chỉ tiêu KPI của tháng (Supabase).
- `ref_countries` hoặc `turso country_codes` (332 dòng): Dùng ánh xạ mã nước sang tên quốc gia chuẩn để hiển thị trên biểu đồ "Top Điểm Đến" (`region-chart/route.ts`).

---

## 3. Công Thức Tính Toán & Quy Tắc Nghiệp Vụ

### A. Hệ số Dự phóng (Projection Factor)
Dùng để dự kiến kết quả doanh thu khi kết thúc tháng hiện tại dựa trên tiến độ chạy thực tế.
$$\text{Projection Factor} = \frac{\text{Tổng số ngày trong tháng}}{\text{Số ngày đã trôi qua}}$$

*Lưu ý nghiệp vụ*:
- Chỉ áp dụng hệ số này cho **tháng hiện tại**. Các tháng lịch sử đã qua có hệ số mặc định là `1.0`.
- Hệ thống hiển thị cảnh báo trực quan nếu khoảng thời gian do người dùng chọn (Date range) không bắt đầu từ ngày đầu tiên của tháng để tránh hiểu sai số liệu dự phóng.

### B. Doanh thu Dự phóng (Projected Revenue)
$$\text{Projected Revenue} = \text{Doanh thu thực tế tích lũy} \times \text{Projection Factor}$$

### C. Tỷ lệ hoàn thành KPI Pro-rata (KPI Pro-rata Target)
Áp dụng cơ chế chia tỷ lệ ngày trôi qua để đánh giá xem doanh thu hiện tại có đang đi đúng hướng đạt mục tiêu cuối tháng hay không.
$$\text{KPI Pro-rata Target} = \text{Chỉ tiêu KPI của tháng} \times \left( \frac{\text{Số ngày đã trôi qua}}{\text{Tổng số ngày trong tháng}} \right)$$
$$\text{\% Đạt Pro-rata} = \frac{\text{Doanh thu thực tế đạt được}}{\text{KPI Pro-rata Target}} \times 100\%$$

---

## 4. Quản Lý Bộ Nhớ Đệm (Caching Layer)
Để khắc phục tình trạng truy xuất kho dữ liệu lớn bị chậm, hệ thống áp dụng cơ chế bộ nhớ đệm hai tầng (L2 Supabase Cache - Migration v20):
- **L1 Cache (In-Memory)**: Lưu trữ trong bộ nhớ máy chủ trong vòng `5 phút` cho mỗi phiên bản instance.
- **L2 Cache (Supabase `analytics_query_cache`)**: Lưu trữ phân tán dùng chung trong vòng `10 phút`.
- Admin có thể bấm nút "Xóa Cache" (Màu vàng) trong mục Settings để làm mới số liệu ngay lập tức.

---

## 5. Phân Quyền
- Được quản lý thông qua ma trận `role_permissions` (lưu tại `app_settings` dưới dạng JSON).
- Vai trò có quyền xem mặc định: **Admin, Creator, Manager, BOD, Staff**.
- Vai trò **Standard**: Không được phép truy cập trang này.
- **Ẩn công thức / Methodology**: Các phần chú thích công thức dự phóng phức tạp chỉ hiển thị với vai trò **Admin** (để giảm tải nhận thức và tối ưu trải nghiệm cho các bộ phận khác).\n