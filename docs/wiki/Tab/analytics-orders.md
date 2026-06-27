# Orders Management (Quản Lý Đơn Hàng BI)

Trình duyệt danh sách đơn hàng tích lũy lấy trực tiếp từ kho dữ liệu, hỗ trợ tìm kiếm mờ nâng cao và xuất dữ liệu sỉ hàng loạt.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/orders` (`web/src/app/(dashboard)/analytics/orders/page.tsx`)
- **API Order List**: `/api/orders` (`web/src/app/api/orders/route.ts`)
- **API Export Orders**: `/api/orders/export` (`web/src/app/api/orders/export/route.ts`)

---

## 2. Kỹ Thuật Truy Vấn & Thiết Kế
- **Safe Dates & Input Sanitization**: Để ngăn chặn nguy cơ bị tấn công chèn mã độc (SQL Injection) qua các ô nhập ngày lọc của đơn hàng, API `/api/orders` áp dụng các hàm đóng băng giá trị an toàn như `safeDate()` và `safeCompanyCode()` để làm sạch tuyệt đối các chuỗi ngày tháng trước khi đưa vào mệnh đề truy vấn cơ sở dữ liệu.
- **Phân trang**: Toàn bộ dữ liệu đơn hàng đồ sộ hiển thị mặc định `20 bản ghi trên mỗi trang` thông qua component phân trang `pager.tsx`.

---

## 3. Tính Năng Vận Hành
- **Tìm kiếm nâng cao**: Cho phép lọc nhanh đơn hàng theo Mã đơn, Mã SKU, Tên khách hàng, Kênh bán hoặc Mã nhân viên chăm sóc.
- **Xuất dữ liệu Excel (Export XLSX)**: Nút xuất báo cáo cho phép tải nhanh danh sách đơn hàng đã lọc ra tệp tin bảng tính để phục vụ đối soát kế toán trực tiếp.

---

## 4. Phân Quyền
- Kích hoạt hiển thị cho các vai trò: **Admin, Creator, BOD, Manager, Staff**.
- Vai trò Standard hoàn toàn bị chặn để bảo mật thông tin đơn hàng cá nhân của khách hàng.\n