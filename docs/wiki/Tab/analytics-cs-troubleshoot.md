# CS Troubleshoot Hub (Trung Tâm Khắc Phục Sự Cố CS)

Phân hệ quản trị dành riêng cho bộ phận Chăm sóc Khách hàng (Customer Service) để đối soát, tra cứu lịch sử khiếu nại và đồng bộ hóa các vé sự cố (Tickets) từ hệ thống Lark.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/cs-troubleshoot` (`web/src/app/(dashboard)/analytics/cs-troubleshoot/page.tsx`)
- **API Backend**: `/api/reports/cs-troubleshoot` (`web/src/app/api/reports/cs-troubleshoot/route.ts`)

---

## 2. Kiến Trúc Kỹ Thuật & Tích Hợp Dữ Liệu Lark

### A. Hạ tầng Lưu Trữ
- Toàn bộ dữ liệu sự cố được đồng bộ từ Turso sang Supabase lưu trữ tập trung tại bảng `lark_cs_tickets` với quy mô hơn **24,712 bản ghi**.
- Quá trình chuyển đổi dữ liệu được thực hiện tự động bằng tập lệnh Python: `scripts/migrate_turso_tickets.py`.

### B. Tính năng Giao diện & Vận Hành
- **Phân trang 20 dòng**: Bảng danh sách phản hồi sự cố áp dụng cơ chế phân trang `20 hàng` thông qua component `pager.tsx` để tối ưu hiệu suất.
- **Manual Trigger Buttons**: Cung cấp 2 nút chức năng đặc quyền dành riêng cho quản trị viên là "Đồng bộ vé từ Lark (Sync)" và "Di chuyển dữ liệu (Migrate)" để cập nhật vé khẩn cấp trực tiếp tại giao diện mà không cần chạy dòng lệnh server.
- **Thông báo lỗi thân thiện**: Nếu có sự cố đường truyền, hệ thống sẽ ẩn lỗi hệ thống thô và hiển thị banner thông báo thân thiện: *"Hiếu đang fix, vui lòng đợi"* để giữ trải nghiệm người dùng luôn chuyên nghiệp.

---

## 3. Phân Quyền
- Vai trò xem: **Admin, Creator, Manager, BOD, Staff**.
- Vai trò Standard không có quyền truy cập.\n