# All-Time Report (Báo Cáo Hiệu Suất Lịch Sử)

Trang phân tích hiệu suất kinh doanh đa năm, đa kỳ, hỗ trợ so sánh hiệu quả tăng trưởng giữa kỳ này với kỳ trước.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/all-time` (`web/src/app/(dashboard)/analytics/all-time/page.tsx`)
- **API Backend**: `/api/analytics/all-time-performance` (`web/src/app/api/analytics/all-time-performance/route.ts`)

---

## 2. Quy Tắc Nghiệp Vụ & So Sánh
- **Bộ lọc ngày**: Khác biệt với các tab khác, bộ lọc ngày của All-Time hoạt động dựa trên cơ chế kích hoạt nút "Áp dụng" thủ công để tránh việc gửi liên tục các query nặng về kho dữ liệu lịch sử.
- **Phân nhóm Kênh**: Phân lọc doanh thu rõ ràng theo 3 trục kinh doanh lớn:
  - **B2B-Strategic** (Đối tác sỉ chiến lược).
  - **B2B-Non-Strategic** (Đại lý sỉ thông thường).
  - **B2C** (Bán lẻ trực tiếp đến người tiêu dùng).
- **Casing Nhất quán**: Toàn bộ chuỗi định danh được chuẩn hóa chính xác, ví dụ nhãn `"Non-Strategic"` viết hoa chữ S theo chuẩn kỹ thuật chung.

---

## 3. Phân Quyền
- Kích hoạt hiển thị cho các vai trò: **Admin, Creator, BOD, Manager, Staff**.
- Vai trò **Standard**: Bị chặn truy cập.\n