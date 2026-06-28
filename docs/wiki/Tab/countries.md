# Reference Countries (Danh Mục Quốc Gia Tham Chiếu)

Quản lý danh mục các quốc gia, vùng lãnh thổ, nhóm địa lý và hỗ trợ ánh xạ ISO Code chuẩn hóa toàn hệ thống.

> **Mục đích & vai trò**: Master Data địa lý — mọi nơi (SKU, gói NCC, đơn hàng, dashboard "Top điểm đến") đều map về đây để hiển thị tên nước thống nhất. **Tại sao cần**: GoHub dùng mã nước custom (RUS, EU1, W04...) không phải ISO chuẩn; phải có bảng tham chiếu để decode mã→tên + nhóm nước hỗ trợ → tránh mỗi nơi hiểu một kiểu.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/countries` (`web/src/app/(dashboard)/countries/page.tsx`)
- **API Backend**: `/api/countries` (`web/src/app/api/countries/route.ts`)

---

## 2. Thiết kế Cơ Sở Dữ Liệu
Dữ liệu lưu trữ chính tại các bảng:
- **`ref_countries`**: Bản ghi đầy đủ về quốc gia, mã ISO 2 ký tự (ISO2), ISO 3 ký tự (ISO3), tên tiếng Anh, tên tiếng Việt, và mã vùng điện thoại.
- **`ref_support_countries`**: Danh sách thực tế các nước mà GoHub có hạ tầng cung cấp dịch vụ viễn thông/SIM du lịch.

---

## 3. Quy Trình Vận Hành
- **Chuẩn hóa địa lý**: Là cơ sở dữ liệu nền (Master Data) để toàn bộ hệ thống tham chiếu. Mọi thực thể như SKU, Gói cước của NCC hay Đơn hàng từ kho dữ liệu đều ánh xạ về bảng quốc gia này để chuẩn hóa hiển thị.
- **Tìm kiếm & Phân nhóm**: Hỗ trợ tìm kiếm quốc gia theo tên, mã ISO hoặc phân loại theo châu lục (Asia, Europe, America, Africa, Oceania).

---

## 4. Phân Quyền
- **Standard / Staff / BOD**: Được truy cập để xem và tra cứu danh mục phục vụ công tác bán hàng hoặc đối chiếu vận hành.
- **Manager / Admin / Creator**: Có quyền cập nhật thông tin quốc gia, chỉnh sửa tên hiển thị hoặc thêm nhóm địa lý mới khi có điều chỉnh.\n