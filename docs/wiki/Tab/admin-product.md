# Admin Product (Quản Trị Sản Phẩm & Hệ Thống)

Trang cấu hình kỹ thuật sâu dành riêng cho quản trị viên bao gồm thiết lập luật đích SKU, phân loại nhóm cấp bậc đại lý và đồng bộ hạ tầng.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/admin` (`web/src/app/(dashboard)/admin/page.tsx`) — gồm các tab: Cài đặt, Tạo template, Khuyến mãi, Lịch Lark.
- **Lưu ý (s82)**: Quản lý tài khoản người dùng & phân quyền (thêm/đổi mật khẩu/role/ma trận) đã **gộp về `/analytics/users`** (tab "Users"), KHÔNG còn ở `/admin`.
- **Lưu ý dọn trùng (s82)**: tab "Cài đặt" của `/admin` đã **bỏ** các mục bị trùng/sai chỗ:
  - **Guardian** (Chính sách truy cập Chatbot) và **Role Filters** (Lọc dòng BI theo Role) — trùng `/analytics/settings`, giờ CHỈ còn ở Settings.
  - **KPI Target B2C** và **Ngân sách Marketing B2C** — dời sang đúng trang **KPI/Target** (`/analytics/targets`).
  - `/admin` Cài đặt giờ chỉ còn: Tỷ giá, Công thức 3HK, Partner Tiers, SKU Destination rule.
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

### B. Partner Tiers (Channel & Customer Tiers) — ĐÃ CHUYỂN sang Settings (s82)
- Mục "Channel & Customer Tiers" trước ở đây **trùng** với "Đối tác chiến lập (Partner Tiers)" trong `/analytics/settings` (cùng API `/api/config/partner-tiers`).
- (s82) Đã **gộp về Settings**, lấy UI bản admin (đẹp hơn: thêm/xóa nhóm tier, datalist gợi ý tên kênh, lưới card). Admin KHÔNG còn mục này.

### C. Nút Kiểm soát Đồng bộ (Manual Triggers)
- Cung cấp các công cụ vận hành khẩn cấp cho phép quản trị viên kích hoạt trực tiếp các tiến trình đồng bộ dữ liệu từ Lark, Turso hoặc xóa sạch bộ nhớ đệm cache hệ thống.

---

## 3. Phân Quyền
- Cực kỳ nghiêm ngặt: **CHỈ dành cho tài khoản có vai trò `admin` hoặc `creator`**.
- Mọi vai trò khác như Standard, Staff, BOD hay Manager đều không thể xem hay tương tác với trang này (hệ thống sẽ tự động chuyển hướng - redirect về trang chủ chatbot nếu cố tình truy cập).\n