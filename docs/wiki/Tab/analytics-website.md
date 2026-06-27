# Website Analytics (Phân Tích Website GA4 & GSC)

Trang số liệu tích hợp trực tiếp từ Google Analytics 4 (GA4) và Google Search Console (GSC) để theo dõi hành vi truy cập và hiệu suất SEO của các trang web GoHub.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/website` (`web/src/app/(dashboard)/analytics/website/page.tsx`)
- **API GA4 Traffic**: `/api/analytics/ga4` (`web/src/app/api/analytics/ga4/route.ts`)
- **API GSC Search**: `/api/analytics/gsc` (`web/src/app/api/analytics/gsc/route.ts`)

---

## 2. Thiết kế Kỹ Thuật & Tích Hợp Google API
- **Google Service Account**: Hệ thống kết nối thông qua file khóa dịch vụ cấu hình bảo mật ở biến môi trường của Vercel (`GA4_CLIENT_EMAIL`, `GA4_PRIVATE_KEY`).
- **GA4 Properties**: Quản lý 2 thuộc tính Website lớn của GoHub lưu tại bảng `app_settings` (key `ga4_configs`):
  - `gohub.com` (Property ID: 506829852)
  - `gohub.vn` (Property ID: 509612068)
- **GSC Site Verification**: Kết nối trực tiếp đến Search Console API để kéo số liệu từ hai tên miền tương ứng.

---

## 3. Các Chỉ Số KPI Website & Công Thức

### A. Tỉ lệ chuyển đổi Website (Ecommerce Conversion Rate - CR)
Để phản ánh chính xác hiệu quả kinh doanh của thương mại điện tử, hệ thống thay thế cách tính Conversion Rate cũ (đếm mọi loại sự kiện chuyển đổi rác khiến CR > 100%) bằng công thức chuẩn hóa dựa trên giao dịch mua hàng thực tế:
$$\text{CR \%} = \frac{\text{Số lượng giao dịch mua hàng hoàn thành (ecommercePurchases)}}{\text{Tổng số phiên truy cập (Sessions)}} \times 100\%$$

### B. Chỉ số tương tác & SEO:
- **Sessions / Users**: Tổng số phiên và số lượng khách truy cập hoạt động (activeUsers) trong 28 ngày qua.
- **Bounce Rate (Tỷ lệ thoát)**: Tỷ lệ người dùng rời trang mà không có tương tác nào thêm.
- **Clicks / Impressions / CTR**: Chỉ số click chuột, lượt hiển thị và tỷ lệ click tự nhiên từ Google Search.
- **Average Position**: Vị trí hiển thị trung bình của các từ khóa GoHub trên trang tìm kiếm Google.

---

## 4. Phân Quyền
- Vai trò xem mặc định: **Admin, Creator, Manager, BOD, Staff**.
- Vai trò Standard không có quyền truy cập.\n