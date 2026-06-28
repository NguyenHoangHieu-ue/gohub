# Admin Product (Quản Trị Sản Phẩm & Hệ Thống)

Trang cấu hình kỹ thuật sâu dành riêng cho quản trị viên bao gồm thiết lập luật đích SKU, phân loại nhóm cấp bậc đại lý và đồng bộ hạ tầng.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/admin` (`web/src/app/(dashboard)/admin/page.tsx`) — gồm các tab: Cài đặt, Tạo template, Khuyến mãi, Lịch Lark.
- **Lưu ý (s82)**: Quản lý tài khoản người dùng & phân quyền (thêm/đổi mật khẩu/role/ma trận) đã **gộp về `/analytics/users`** (tab "Users"), KHÔNG còn ở `/admin`.
- **API SKU Destination Rule**: `/api/config/sku-destination-rule` (`web/src/app/api/config/sku-destination-rule/route.ts`)
- **API Partner Tiers**: `/api/config/partner-tiers` (`web/src/app/api/config/partner-tiers/route.ts`)
- **Các API đồng bộ thủ công**:
  - `/api/admin/sync-turso-users` — Đồng bộ tài khoản người dùng từ hệ thống cũ.
  - `/api/admin/sync-turso-costs` — Đồng bộ cấu hình chi phí từ cơ sở dữ liệu Turso.
  - `/api/admin/sync-lark-tickets` — Đồng bộ dữ liệu CS ticket từ Lark.

---

## 2. Các Phân Hệ Cấu Hình Cốt Lõi

### A. SKU Destination Rule (Luật Đích SKU)
- Cho phép cấu hình quy tắc bóc tách mã SKU tự động của hệ thống để xác định nhà mạng đích (Destination operator).
- Các tham số thiết lập:
  - **Prefix**: Tiền tố nhận diện.
  - **Offset**: Vị trí bắt đầu cắt chuỗi mã SKU.
  - **Code Length**: Độ dài chuỗi con cần lấy để định danh nhà mạng.

### B. Partner Tiers (Nhóm Đại Lý & Đối Tác)
- Thiết lập phân tầng đối tác sỉ (B2B) trực quan bằng dạng thẻ (Chips) thay thế cho việc nhập chuỗi JSON thô như trước.
- Admin có thể thêm/bớt nhóm, quản lý danh sách đối tác thuộc từng Tier để hệ thống BI tính toán doanh thu/báo cáo sỉ chính xác theo phân cấp.

### C. Nút Kiểm soát Đồng bộ (Manual Triggers)
- Cung cấp các công cụ vận hành khẩn cấp cho phép quản trị viên kích hoạt trực tiếp các tiến trình đồng bộ dữ liệu từ Lark, Turso hoặc xóa sạch bộ nhớ đệm cache hệ thống.

---

## 3. Phân Quyền
- Cực kỳ nghiêm ngặt: **CHỈ dành cho tài khoản có vai trò `admin` hoặc `creator`**.
- Mọi vai trò khác như Standard, Staff, BOD hay Manager đều không thể xem hay tương tác với trang này (hệ thống sẽ tự động chuyển hướng - redirect về trang chủ chatbot nếu cố tình truy cập).\n