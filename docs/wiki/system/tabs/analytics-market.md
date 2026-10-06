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
2. **Kho báo giá vendor** — chưa làm. Upload báo giá từng vendor (đang dùng / vendor mới / đang được chào), AI đề xuất ghép cột lần
   đầu → Hiếu duyệt → lưu mapping theo vendor, lần sau tự ghép. Giá full: datapool = giá data (công thức `datapool.*` dùng chung) +
   phí khung eSIM/SIM tuỳ loại; vendor thường = giá eSIM full, SIM = eSIM full + giá khung SIM (SKU khung trong hệ thống); quy đổi
   tỷ giá theo tháng (`lib/fx`). Tự xếp vendor rẻ nhất theo thị trường + gói, so COGS SKU đang bán.
3. **Destination chưa bán** — chưa làm. Nước có trong danh sách hỗ trợ/báo giá nhưng GoHub chưa có SKU active, kèm giá full rẻ nhất.

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
- %QoQ của quý đang chạy so dự phóng (thực tế × hệ số ngày) với quý trước đủ.

## Gotchas
- Chế độ Fulfillment cố định (không có toggle Created — cần GP).
- `units` cộng theo SKU; không có số đơn ở cấp thị trường (COUNT DISTINCT theo SKU cộng lại sẽ đếm trùng).
- Bộ lọc KH Ops/KH loại trừ (`quarterly_excluded_customers`) CHƯA áp — số = doanh thu B2B+B2C thô trừ ship/nội bộ.
