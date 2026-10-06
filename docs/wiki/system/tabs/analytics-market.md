---
title: "Thị trường & Báo giá"
page_type: tab_guide
is_hidden: true
department: product
tags: [tab, analytics, market, vendor, sku, plan]
created: 2026-10-06
updated: 2026-10-06
status: active
---

# Thị trường & Báo giá

Tab phục vụ lên kế hoạch vận hành sản phẩm (Hiếu, plan action Q4-2026): thị trường nào chiếm chủ yếu, trong từng thị trường vendor /
loại sản phẩm / SKU phân bố ra sao, so quý trước. Theo yêu cầu: **chỉ hiện biểu đồ, mọi bảng gập mặc định** (bấm "Xem bảng" mới mở).

Lộ trình (chốt với Hiếu 2026-10-06):
1. **Thị trường** — đã làm (s225, mục dưới).
2. **So giá vendor** — 2a ĐÃ LÀM (s225, mục 5): 3 nguồn đã có trong hệ thống. 2b CHƯA LÀM: kho upload báo giá vendor khác (KDDI,
   Truemove, Joytel, Simstore…; đang dùng / vendor mới / đang được chào) — AI đề xuất ghép cột lần đầu → Hiếu duyệt → lưu mapping theo
   vendor (cần migration Supabase).
3. **Destination chưa bán** — ĐÃ LÀM (s225, mục 6).

## 1. Đường dẫn & file
- Web `/analytics/market` — `web/src/app/(dashboard)/analytics/market/page.tsx`, chart `market-charts.tsx` (dynamic, ssr:false).
- API `GET /api/analytics/market?quarter=Q4-2026&group=ALL|B2B|B2C` (`nocache=1` = tải lại mới).
- Logic thuần `web/src/lib/market-breakdown.ts` (test `__tests__/market-breakdown.test.ts`).
- Quyền: id `market` (`ALL_ANALYTICS_IDS`), mặc định role `product` + `bod`; nav nhóm "Analytics & Planning".

## 2. Dữ liệu
- 1 query gohub_dw: `fact_fulfillment_revenue` × `dim_order_source` (B2B+B2C hoặc 1 nhóm — bỏ INTERNAL-TRANSACTION theo s211d) ×
  `dim_sku` (vendor, DISTINCT ON), bỏ `SHIPPINGFEE0`, tới `CURRENT_DATE-1`, GROUP BY SKU × tháng, quý trước + quý này. Đo Q2+Q3-2026:
  ~17k dòng, ~5s.
- Trả dạng nén: `skus[]` (thuộc tính) + `cells[] = [skuIdx, monthIdx, rev, gp, units]` — dạng thô ~2,1MB vượt trần cache 2MB.
- Catalog Supabase theo lô 400 mã (không N+1): `skus.call`, `products.local_phone_number`.
- Cache `market:v1:<quarter>:<group>`, TTL `QUERY_TTL_MIN`.

## 3. Phân loại
- Thị trường = mã nước trong SKU (`decodeSkuDestinationCode`, ký tự 3–5) → tên qua `country_codes` (Turso). Nhóm nước (EU1, GLO…) là 1
  thị trường riêng. SKU không phải 13 ký tự → "(mã khác)".
- Hình thức = ký tự 2 (C eSIM, E SIM, A Data pack top-up, B eSIM profile, D Khung SIM, 1/2 nội địa VN).
- Loại gói = ký tự 8 (Unlimited A/B/C/D/E/G/H/L/X, Fixed F/Y, Daily P/Z/T, K = Khung/Profile).
- Dịch vụ: "Data + SĐT local" (product `local_phone_number=Yes`) > "Data + Call/SMS" (SKU `call=Yes`) > "Data only"; SKU không có trong
  catalog Supabase → "Chưa rõ". Đếm thật 2026-10-06: skus.call Yes 262 / No 16.928 / null 256; products local Yes 84 / No 1.042.

## 4. Giao diện
- 4 thẻ: doanh thu (kèm dự phóng quý đang chạy `getRangeProjectionFactor`), GP·GM%, số thị trường có doanh thu, top 5 chiếm %.
- Top 15 thị trường, thanh chồng theo Vendor / Dịch vụ / Hình thức / Loại gói. Bấm thị trường → khung chi tiết.
- Khung chi tiết (drill Thị trường → Vendor → Dịch vụ → Hình thức → Loại gói → Product → SKU, breadcrumb quay lại):
  tỷ trọng quý trước vs quý này cho các chiều chưa lọc, xu hướng tháng, top 12 SKU (màu theo vendor, tooltip GM%), so 2 quý theo
  cấp hiện tại (bấm để đi sâu), bảng gập + xuất Excel.
- Màu CỐ ĐỊNH theo giá trị cho cả trang (`market-colors.ts`, xếp theo thứ hạng toàn dữ liệu) — QA lần đầu thấy cùng 1 vendor mỗi biểu đồ 1 màu.
- Quý mới chạy < 30 ngày → mặc định mở quý vừa đóng (dự phóng ngày 5 của quý là ×15, nhiễu).
- %QoQ của quý đang chạy so dự phóng (thực tế × hệ số ngày) với quý trước đủ.

## 5. So giá vendor (mốc 2a) — `GET /api/analytics/market/quotes`
- File: `lib/quote-compare.ts` (logic thuần, test `__tests__/quote-compare.test.ts`), `lib/quote-sources.ts` (nạp nguồn + tính, cache
  `market-quotes:v2:<quarter>:<group>`), `lib/market-data.ts` (bộ nạp doanh thu dùng chung với route `market`), UI `quotes-view.tsx`.
- Nguồn: **3HK** = Supabase `ncc_3hk` (47 nước, HKD/GB — `ncc_datapool` trống, wiki NCC cũ ghi sai) · **BC Datapool CMHK/Singtel** =
  `app_settings.bcdp.price_list` (file "Gohub Updated Pool Offer (20260923)", CMHK HKD/GB, Singtel USD/GB, phí IMSI 0,5 + eSIM 2 CNY +
  thẻ SIM 3 CNY ở dòng đầu) · **WorldMove** = `ncc_worldmove` active, eSIM, giá TWD (từ `firm_import_c.xlsx`, s220). File Portal BC
  "Purchase information" có Settlement Price = 0 (BC tạo gói theo yêu cầu) → không dùng làm giá.
- Giá full (USD): datapool = ROUNDUP(GB tính giá × giá/GB nhà mạng rẻ nhất) quy USD + phí khung. GB tính giá theo Công thức Datapool
  (Fixed × fixed%, Daily × GB/ngày × ngày × daily%, Unlimited 3HK 5Mbps 1.6 / 10Mbps 1.8 GB/ngày, BC chỉ 10Mbps = 1.7 — khác cấu trúc
  gói, có ghi chú). Gói nhiều nước: mỗi nước nhà mạng rẻ nhất, lấy nước đắt nhất; thiếu 1 nước = không có giá.
  Phí khung: 3HK = SKU khung trong hệ thống (`AB0003DK00000` eSIM profile, `1D0003DK00000` SIM); BC = eSIM (CNY) + IMSI, SIM trắng
  `1D000WDK00000` + IMSI; WM: SIM = eSIM + `1D000WMK00000`. Data pack (ký tự 2 = A) không cộng khung.
- Kiểm chứng: SKU `3CJPN3DF00507` COGS 60.103đ ≈ tính lại 2,28 USD. Q3-2026, giá tính lại của chính vendor hiện tại so COGS thật:
  3HK trung vị −3,4% (2.257 SKU), WM −0,6%, BC Singtel −2,2%, BC CMHK 0% ⇒ **mốc so = min(COGS thật, giá tính lại)** để không phóng đại.
- Tiết kiệm/quý = (mốc − giá rẻ nhất của vendor KHÁC vendor hiện tại) × units quý. Q3-2026: 2.157 SKU rẻ hơn, ~1,07 tỷ/quý (chủ yếu
  3HK → BC CMHK ở China, 3HK → WM). Đây là giá vốn — chưa tính chất lượng mạng, KYC (có đánh dấu), tồn kho.

## 6. Destination chưa bán (mốc 3)
- Nước (ISO2) có báo giá từ ≥1 nguồn mà KHÔNG có product Active/Temporary riêng cho nước đó (mã nước 3 ký tự → `ref_support_countries.
  country_codes` đúng 1 nước). Cột "đang có trong gói nhiều nước" liệt kê mã nhóm (EU1, GLB…) đã phủ nước đó.
- Giá full rẻ nhất (eSIM) cho 3 gói tham chiếu: Fixed 3GB/7 ngày, Fixed 10GB/30 ngày, Daily 1GB × 7 ngày. Q3-2026: 42 nước, 1 nước
  (Timor-Leste) chưa có cả trong gói nhiều nước.
- Tên vùng WM nhiều nước kiểu "Europe/Asia/Worldwide" không đổi được sang danh sách nước → bỏ qua (liệt kê ở ghi chú "chưa nhận ra").

## Verify (2026-10-06, staging)
- Q3-2026 theo tháng khớp Quarter Report: T8/T9 khớp tới đồng; T7 lệch 161 nghìn / 8,05 tỷ (Quarter Report lọc thêm KH loại trừ).
- Payload Q3 ALL ~1,4MB, 5.596 SKU, ~5s khi tính mới.

## Gotchas
- Chế độ Fulfillment cố định (không có toggle Created — cần GP).
- `units` cộng theo SKU; không có số đơn ở cấp thị trường (COUNT DISTINCT theo SKU cộng lại sẽ đếm trùng).
- QA giao diện mục So giá vendor CHƯA chụp được (Chrome bị extension khác chặn) — đã kiểm số qua API.
- Bộ lọc KH Ops/KH loại trừ (`quarterly_excluded_customers`) CHƯA áp — số = doanh thu B2B+B2C thô trừ ship/nội bộ.
