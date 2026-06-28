# Management BI (Quản Trị Người Dùng & Hệ Thống BI)

Trang cấu hình kỹ thuật cốt lõi cho phân hệ Business Intelligence bao gồm quản lý tài khoản người dùng, phân quyền chi tiết ma trận chức năng, quản lý metadata cấu hình và tối ưu hóa bộ nhớ đệm.

---

## 1. Tổng quan & Đường dẫn
- **Trang Quản lý Người dùng (GỘP — 1 cửa duy nhất)**: `/analytics/users` (`web/src/app/(dashboard)/analytics/users/page.tsx`). Tất cả thao tác về user gom vào đây qua 5 mục tab: **Người dùng** (danh sách + inline role/phòng ban/quyền báo cáo/PM tabs/xóa/online), **Thêm user**, **Đổi mật khẩu**, **Vai trò × Quyền** (ma trận Role × Report), **Nâng cao** (ma trận Role × Tính năng + Phòng ban × Tab). Các thành phần dùng chung tách ở `web/src/components/user-admin.tsx`.
- **Lưu ý gộp (s82)**: trang `/admin` KHÔNG còn tab "Người dùng & Phân quyền" / "Thêm user" / "Đổi password" — đã dời hết sang `/analytics/users`. `/admin` chỉ còn Cài đặt / Tạo template / Khuyến mãi / Lịch Lark.
- **Trang Cấu hình Metadata**: `/analytics/schema` (`web/src/app/(dashboard)/analytics/schema/page.tsx`)
- **Trang Cấu hình Cài đặt & Cache**: `/analytics/settings` (`web/src/app/(dashboard)/analytics/settings/page.tsx`)
- **Trang Cài đặt của Creator**: `/analytics/creator` (`web/src/app/(dashboard)/analytics/creator/page.tsx`)

---

## 2. Các Phân Hệ Quản Trị Hệ Thống Cốt Lõi

### A. Quản lý Người dùng & Ma Trận Phân Quyền (Role × Report Matrix)
Hệ thống GoHub Intel áp dụng quy chế phân quyền chặt chẽ thông qua sự kết hợp của hai lớp bảo mật:

1. **Phân Quyền Theo Vai Trò Nền (Role Permissions)**:
   - Có 5 nhóm vai trò chính: `admin`, `creator`, `manager`, `bod`, `staff`, `standard`.
   - Mỗi vai trò có ma trận quyền mặc định đối với 18 loại báo cáo BI lưu tại bảng `app_settings` dưới dạng trường JSON `role_permissions`.
   - Để tránh việc dữ liệu bị drift mất quyền của phân hệ Products khi lưu cấu hình, API GET `/api/permissions` áp dụng phép hợp `union(defaults, dbValue)` giữa các cài đặt mặc định gốc và dữ liệu thực tế trong DB.
2. **Cấp Quyền Cộng Dồn Theo Từng Tài Khoản (Per-user allowed_analytics & allowed_tabs)**:
   - Admin có thể cấp thêm quyền xem báo cáo lẻ cho từng nhân viên bằng cách tick chọn trực tiếp trên ma trận ô vuông trực quan (CheckSquare) tại trang cài đặt người dùng thay thế cho việc gán chuỗi thủ công như trước.
   - Sidebar sẽ tự động cộng dồn quyền nền của vai trò và danh sách quyền cấp riêng (`allowed_analytics` + `allowed_tabs` lưu tại Migration `v17`) để hiển thị các danh mục tương ứng.

### B. Cấu Hình Schema Metadata
- Cho phép Admin quản lý các định nghĩa siêu dữ liệu (Metadata) mô tả các bảng trong database. Điều này giúp hệ thống AI Agent `bi-analyst` hiểu chính xác cấu trúc bảng biểu hiện tại của kho dữ liệu `gohub_dw` để sinh câu lệnh SQL chính xác 100%.

### C. Quản lý Bộ Nhớ Đệm BI (BI Cache Settings)
- Báo cáo BI tự động cache dữ liệu qua tầng L2 Supabase Cache.
- Nút "Xoá Cache" (Màu vàng) kết nối trực tiếp đến API `/api/admin/flush-analytics-cache` cho phép xóa sạch các bản ghi cache cũ trong bảng `analytics_query_cache` để đồng bộ số liệu mới nhất lập tức khi có cập nhật khẩn cấp.

### D. Bảng điều khiển của Creator (Creator Settings)
- Kênh quản trị tối cao dành riêng cho người sáng tạo hệ thống (Creator). Layout trang được thiết kế để tự động kiểm tra vai trò người dùng fresh thông qua API `/api/user/me` để cập nhật JWT tức thì, giải quyết dứt điểm tình trạng stale token của tài khoản creator.

---

## 3. Phân Quyền
- **Users, Schema, Settings**: Chỉ hiển thị và cấp quyền chỉnh sửa cho vai trò **Admin và Creator**.
- **Creator Settings**: Chỉ tài khoản có vai trò duy nhất là **`creator`** mới có quyền truy cập và thao tác.\n