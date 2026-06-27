# Vendor Performance (Hiệu Suất Nhà Cung Cấp)

Trang tổng hợp báo cáo chi tiêu mua hàng, chất lượng dịch vụ viễn thông cung cấp và đánh giá mức độ đóng góp doanh thu của các Nhà cung cấp đối tác.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/vendors` (`web/src/app/(dashboard)/analytics/vendors/page.tsx`)
- **API Vendor List**: `/api/analytics/vendors/list` (`web/src/app/api/analytics/vendors/list/route.ts`)
- **API Vendor Report**: `/api/analytics/vendors/report` (`web/src/app/api/analytics/vendors/report/route.ts`)

---

## 2. Điểm Nhấn UX & Vận Hành Giao Diện
- **Bộ lọc Vendor thông minh**: Dropdown lựa chọn danh sách nhà cung cấp được cấu hình thêm một lớp màng bảo vệ (Overlay) trong suốt ở session 61. Khi người dùng click ra ngoài vùng hiển thị, menu dropdown sẽ tự động đóng lại nhẹ nhàng thay vì bị treo đơ trên màn hình.
- **Phân trang**: Danh sách được giới hạn hiển thị tối đa `20 dòng/trang` để đảm bảo tốc độ phản hồi nhanh.

---

## 3. Nội Dung Báo Báo & Phân Tích
- **Chi phí mua hàng (Total COGS spent)**: Tổng dòng tiền GoHub thanh toán nhập hàng cho nhà cung cấp trong kỳ.
- **Tỉ lệ lỗi mạng / eSIM lỗi (Success/Failure Rate)**: Chỉ số phản ánh chất lượng hạ tầng mạng viễn thông của từng đối tác.
- **Thị phần sản phẩm (Volume Share %)**: Tỷ trọng đơn hàng của nhà cung cấp này chiếm bao nhiêu phần trăm trong toàn bộ cơ cấu đơn của GoHub.

---

## 4. Phân Quyền
- Vai trò có quyền xem: **Admin, Creator, Manager, BOD, Staff**.
- Vai trò Standard bị chặn hoàn toàn.\n