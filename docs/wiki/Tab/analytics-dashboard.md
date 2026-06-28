# BI Dashboard (Bảng Điều Khiển Tổng Quan)

Trang tổng quan kinh doanh: cho lãnh đạo/nhân viên nhìn nhanh doanh thu thực tế, **dự phóng cuối tháng**, tiến độ đạt KPI và top điểm đến. Đây là trang "mặt tiền" của phân hệ Analytics.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: trả lời 3 câu hỏi trong 5 giây — (1) Tháng này đang bán được bao nhiêu? (2) Theo đà này cuối tháng đạt bao nhiêu? (3) So với KPI đặt ra thì đang nhanh hay chậm?
- **Tại sao cần trang riêng**: các tab khác (BOD, B2B, B2C) đi sâu từng mảng; Dashboard gom KPI tổng để không phải mở nhiều tab — giảm tải nhận thức (định hướng UI toàn app từ mockup B2C).

## 2. Đường dẫn & file
- **Giao diện Web**: `/analytics` — `web/src/app/(dashboard)/analytics/page.tsx`
- **API KPIs**: `/api/analytics/kpis` — `web/src/app/api/analytics/kpis/route.ts`
- **API Biểu đồ doanh thu**: `/api/analytics/revenue-chart`
- **API Biểu đồ vùng (Top điểm đến)**: `/api/analytics/region-chart`
- **Lớp kết nối DB**: `web/src/lib/analytics-db.ts` (pool pg tới `gohub_dw`) + `web/src/lib/analytics-helpers.ts` (cache).

## 3. Cách hoạt động (luồng dữ liệu)
1. Người dùng chọn khoảng ngày (mặc định = từ đầu tháng hiện tại → hôm nay).
2. FE gọi song song `kpis` + `revenue-chart` + `region-chart` (giảm round-trip).
3. Mỗi API tính trên `gohub_dw` rồi trả qua **lớp cache 2 tầng** (xem mục 6) → lần sau lấy cache.
4. FE tính **dự phóng** (projection) phía client từ số ngày đã trôi qua và render KPI card + chart.

## 4. Nguồn dữ liệu chi tiết (lấy gì, từ đâu, tại sao)
- `fact_fulfilment_revenue` / `fact_sales_revenue` (`gohub_dw`): doanh thu thực tế theo ngày. **Tại sao**: đây là bảng fact đã chuẩn hoá từ pipeline ETL, là nguồn doanh thu "thật" của công ty.
- `analytics_target_planning` (Supabase): chỉ tiêu KPI tháng để so sánh pro-rata. **Tại sao tách Supabase**: KPI do người dùng nhập tay trên web (không thuộc kho ETL).
- **Mã nước → tên quốc gia** cho "Top Điểm Đến": map qua **Turso `country_codes`** (332 dòng), KHÔNG dùng `dim_location` (vốn là TÊN CHI NHÁNH như "Tân Sơn Nhất - HCM", không phải nước).

## 5. Công thức nghiệp vụ
### A. Hệ số dự phóng (Projection Factor)
$$\text{Projection Factor} = \frac{\text{Tổng số ngày trong tháng}}{\text{Số ngày đã trôi qua}}$$
- Chỉ áp cho **tháng hiện tại**; tháng lịch sử = `1.0`.
- Hiện cảnh báo nếu Date range KHÔNG bắt đầu từ ngày 1 (vì dự phóng sẽ sai nếu thiếu đầu tháng).

### B. Doanh thu dự phóng
$$\text{Projected Revenue} = \text{Doanh thu tích lũy} \times \text{Projection Factor}$$

### C. KPI Pro-rata (đánh giá đang nhanh/chậm)
$$\text{KPI Pro-rata} = \text{KPI tháng} \times \frac{\text{Số ngày đã trôi qua}}{\text{Tổng số ngày trong tháng}}$$
$$\%\text{ Đạt} = \frac{\text{Doanh thu thực tế}}{\text{KPI Pro-rata}} \times 100\%$$
**Tại sao pro-rata**: so doanh thu giữa tháng với KPI cả tháng sẽ luôn "thấp giả" → chia theo ngày trôi qua mới công bằng.

## 6. Caching & hiệu năng (tại sao, đã gặp gì)
- **Vấn đề gốc**: query nặng quét `fact_fulfilment_revenue` (~585k dòng), cột ngày kiểu TEXT không index → **Parallel Seq Scan toàn bảng**; 1 trang fan-out nhiều query → chậm 20s+ khi cold-load.
- **Giải pháp**: cache 2 tầng trong `analytics-helpers.ts`:
  - **L1 in-memory** (per-instance) + **L2 Supabase `analytics_query_cache`**, **TTL 12h** (data `gohub_dw` chỉ đổi 1 lần/ngày qua ETL).
  - **Cron prewarm 06:30 ICT** (`/api/cron/prewarm-analytics`) làm nóng cache trước giờ làm.
- **Bug nền đã fix (S81)**: `void supabaseAdmin...upsert()` KHÔNG gửi request (builder supabase-js là thenable lazy) → L2 chưa từng chạy; fix bằng `await`.
- Nút "Xoá Cache" (Settings) flush thủ công khi cần số liệu tươi gấp.

## 7. Vấn đề đã gặp & cách khắc phục (lịch sử)
- **Top Destinations hiển thị sai nước (S79)**: hàm `getDestinationSQL` cắt mã country sai offset — vị trí mã nước trong SKU khác nhau theo họ (digit-prefix → ký tự 3-5; E-prefix → 2-4; 3-letter → 1-3). Fix: cắt theo họ SKU + map qua Turso `country_codes`.
- **DB không load trên Preview (S79)**: do biến `ANALYTICS_DB_*` chưa tick scope Preview trên Vercel → query trả `[]` âm thầm. Fix vận hành: set env Preview.

## 8. Phân quyền
- Ma trận `role_permissions` (lưu `app_settings` JSON) + cấp thêm per-user (`allowed_analytics`).
- Mặc định xem: **Admin, Creator, Manager, BOD, Staff**. **Standard**: không truy cập.
- **Ẩn chú thích công thức (methodology)**: chỉ hiện với **Admin** để giảm tải cho bộ phận khác.
