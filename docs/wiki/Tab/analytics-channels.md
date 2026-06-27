# Channel Performance (Hiệu Suất Kênh Bán Hàng)

Trang phân tích chi tiết hiệu quả doanh số và dòng tiền của từng kênh bán lẻ, bán sỉ và đại lý liên kết.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/channels` (`web/src/app/(dashboard)/analytics/channels/page.tsx`)
- **API KPIs**: `/api/analytics/channels/kpis` (`web/src/app/api/analytics/channels/kpis/route.ts`)
- **API Performance**: `/api/analytics/channels/performance` (`web/src/app/api/analytics/channels/performance/route.ts`)
- **API Trend**: `/api/analytics/channels/trend` (`web/src/app/api/analytics/channels/trend/route.ts`)

---

## 2. Kiến Trúc Kỹ Thuật & Cấu Hình Phí Sàn (Platform Fee)
- Hệ thống hỗ trợ thiết lập tỷ lệ phí nền tảng riêng biệt cho từng kênh bán (Ví dụ: Shopee phí 8%, Klook phí 12%) tại API `/api/analytics/channels-with-platform-fee`.
- Doanh thu kênh bán lẻ sau đó sẽ tự động khấu trừ khoản phí sàn này trước khi đưa vào các thuật toán tính toán GPM2 tổng quát.

---

## 3. Phân Quyền
- Vai trò được xem mặc định: **Admin, Creator, Manager, BOD, Staff**.
- Phân quyền theo phòng ban: Chỉ những nhân viên thuộc bộ phận liên quan trực tiếp đến quản trị kênh mới được cấp quyền truy cập tab này qua trường `allowed_tabs`.\n