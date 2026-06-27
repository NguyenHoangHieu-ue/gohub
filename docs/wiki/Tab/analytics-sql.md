# SQL Explorer (Trình Truy Vấn SQL Nội Bộ)

Trình thực thi truy vấn cơ sở dữ liệu kho dữ liệu PostgreSQL trực tiếp dành riêng cho quản trị viên và chuyên viên phân tích dữ liệu cao cấp.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/sql` (`web/src/app/(dashboard)/analytics/sql/page.tsx`)
- **API SQL Query**: `/api/admin/sql-query` (`web/src/app/api/admin/sql-query/route.ts`)
- **API SQL Schema**: `/api/admin/sql-schema` (`web/src/app/api/admin/sql-schema/route.ts`)

---

## 2. Thiết Kế Bảo Mật & Kỹ Thuật Nghiêm Ngặt

### A. Giới Hạn Quyền Thực Thi (Read-Only Safety)
Để đảm bảo an toàn tuyệt đối cho kho dữ liệu kinh doanh, API `/api/admin/sql-query` thiết lập các rào cản kỹ thuật nghiêm ngặt:
- **Chỉ cho phép lệnh SELECT**: Hệ thống phân tích cú pháp câu lệnh truy vấn, chỉ chấp nhận các câu lệnh bắt đầu bằng `SELECT` hoặc mệnh đề tạo bảng tạm `WITH`.
- **Cấm tuyệt đối các lệnh can thiệp cấu trúc dữ liệu**: Mọi câu lệnh có chứa các từ khóa phá hoại như `DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE` hoặc thực thi nhiều mệnh đề đồng thời (Multi-statement phân tách bằng dấu chấm phẩy `;`) đều bị máy chủ từ chối thực thi lập tức và trả về mã lỗi bảo mật.

### B. Hiển thị lỗi SQL thô phục vụ Debug
Khác biệt với các trang báo cáo BI thông thường (luôn ẩn lỗi thô và hiện banner an toàn), SQL Explorer giữ nguyên cơ chế hiển thị thông điệp lỗi trực tiếp từ database PostgreSQL để phục vụ chuyên viên phân tích dữ liệu sửa lỗi cú pháp câu lệnh SQL của họ nhanh chóng.

---

## 3. Phân Quyền
- Vai trò được phép truy cập: **Admin và Creator**.
- Tất cả các vai trò khác (bao gồm cả BOD, Manager hay Staff) đều bị chặn truy cập tuyệt đối để tránh rò rỉ cấu trúc cơ sở dữ liệu nội bộ nhạy cảm.\n