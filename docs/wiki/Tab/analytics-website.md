# Website Analytics (Phân Tích Website GA4 & GSC)

Tích hợp Google Analytics 4 (GA4) + Google Search Console (GSC) để theo dõi traffic web và hiệu suất SEO của GoHub.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: theo dõi web bán hàng — bao nhiêu khách, chốt đơn bao nhiêu %, từ khoá SEO ra sao → đầu vào cho B2C (CR) và marketing.
- **Tại sao cần**: doanh thu B2C phụ thuộc traffic + tỷ lệ chuyển đổi web; cần số liệu Google thật, không có trong gohub_dw.

## 2. Đường dẫn & file
- **Web**: `/analytics/website` — `web/src/app/(dashboard)/analytics/website/page.tsx`
- **API**: `/api/analytics/ga4` (traffic), `/api/analytics/gsc` (search)

## 3. Tích hợp Google & nguồn dữ liệu
- **Service Account**: kết nối qua key ở env Vercel (`GA4_CLIENT_EMAIL`, `GA4_PRIVATE_KEY`).
- **GA4 Properties** (lưu `app_settings` key `ga4_configs`): `gohub.com` (506829852), `gohub.vn` (509612068).
- **GSC**: kéo số liệu search 2 tên miền tương ứng.
- **Tại sao 2 property**: GoHub có 2 site (.com quốc tế + .vn) → tách số liệu theo thị trường.

## 4. Chỉ số & công thức
$$\text{CR \%} = \frac{\text{ecommercePurchases (giao dịch mua hoàn thành)}}{\text{Sessions (phiên truy cập)}} \times 100\%$$
- **Sessions / activeUsers** (28 ngày), **Bounce Rate**.
- **Clicks / Impressions / CTR / Average Position** (GSC).

## 5. Vấn đề đã gặp & cách khắc phục
- **CR > 100% (bản cũ)**: đếm mọi loại sự kiện chuyển đổi "rác" → vô lý. Fix: chỉ đếm `ecommercePurchases` / Sessions → CR chuẩn TMĐT.
- **GSC fix (S77)**: chỉnh lại kết nối/tham số để kéo đúng số liệu search.

## 6. Phân quyền
- **Admin, Creator, Manager, BOD, Staff**. **Standard** không truy cập.
