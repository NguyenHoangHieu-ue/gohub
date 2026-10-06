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
2. **So giá vendor** — 2a ĐÃ LÀM (s225, mục 5): 3 nguồn đã có trong hệ thống. 2b ĐÃ LÀM (mục 7): kho báo giá vendor gửi để đánh giá
   (ảnh/PDF/Word/Excel/text → AI đọc → duyệt → tự vào so giá). Hiếu chốt: vendor khác (KDDI, Truemove…) CHƯA cần nhập bảng giá đầy đủ.
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

## 7. Báo giá vendor đang chào (mốc 2b) — cần migration `v69_vendor_quotes.sql`
- Bảng `vendor_quotes` (1 dòng/lần vendor gửi): vendor, status `reviewing|accepted|rejected`, quote_date, currency, moq, note,
  `items` JSONB (gói đã duyệt), `files` JSONB (đường dẫn file gốc). File gốc ở Storage bucket RIÊNG TƯ `vendor-quotes` (code tự tạo),
  mở qua signed URL 10 phút. Quyền: admin/creator hoặc user được cấp ghi tab `market`.
- Luồng: "Thêm báo giá" → thả file / dán ảnh (Ctrl+V) / dán text → `POST vendor-quotes/extract` (Gemini đọc, CHƯA lưu) → bảng sửa được
  (nước ISO2, nhóm nước GoHub cho vùng như "Europe", loại, GB, ngày, giá eSIM, giá SIM, gọi) → `POST vendor-quotes` lưu. PATCH đổi trạng
  thái, DELETE xoá cả file. Ghi xong `flushByDeps(["vendor-quotes"])` → cache `market-quotes:v3` tính lại.
- `lib/vendor-quote-extract.ts`: prompt + `normalizeExtracted` (không tin model: bỏ dòng thiếu giá/ngày/loại, mã nước/nhóm phải tồn tại,
  "78.000" → 78000, "£1.99" → 1.99). Thử thật 2026-10-06: VNPT PDF (8 gói, 8,8s — gói RU gắn đúng 16 nước + "Sim thoại") và ảnh email
  Roam Communication (15 gói, 13,7s — UK kèm gọi + roaming vào ghi chú, Europe → `EUR`, World → `GLB`, MOQ).
- So giá: mỗi báo giá (trừ Từ chối) = 1 nguồn gói "Vendor (đang chào)". So khớp kiểu PHỤC VỤ ĐỦ NHU CẦU (áp cả WorldMove): cùng loại
  gói, dung lượng ≥ SKU, số ngày dài hơn SKU tối đa 2 ngày (31 vs 30), tập nước gói ⊇ nước SKU; lấy gói rẻ nhất, chi tiết ghi "gói lớn
  hơn / gói phủ N nước / N ngày". QA s225 (2 báo giá thật × 16.561 SKU Active): khớp đúng dung lượng bỏ lỡ VNPT 5GB/ngày vs SKU Việt Nam
  1–3GB/ngày; sau sửa VNPT rẻ hơn 104 SKU (VN Daily −35…−78%, Unlimited 15 ngày Mỹ/China −40…−50%), Roam rẻ hơn 49 SKU (gói World cho
  Ấn Độ/UAE/Úc/Brazil).
- Hạn chế đã biết: gói Unlimited không so tốc độ (gói vendor "không giới hạn tốc độ cao" vs SKU throttle 5/10Mbps là gói vendor TỐT hơn
  → an toàn; nếu sau này vendor báo Unlimited có throttle thấp hơn SKU thì có thể báo tiết kiệm sai). Nhóm "World 94 countries" map tay
  sang `WOR`/`GLB` là xấp xỉ — kiểm nước cụ thể trước khi quyết. Số "có giá cho N SKU" gồm cả gói World đắt hơn (chỉ số "rẻ hơn" là chính). SIM = giá SIM vendor báo (không cộng khung); không báo giá SIM thì không
  có phương án SIM. Destination chưa bán tính cả báo giá có ≤ 20 nước liệt kê (gói World/Europe bỏ để danh sách không loãng).
- Bấm 1 báo giá → mọi biểu đồ/bảng dưới chuyển sang "báo giá này rẻ hơn mốc hiện tại ở SKU nào" (tiết kiệm/quý theo sản lượng thật).

## 8. Viết cho người không rành số (s225, Hiếu: "vai user khó tính, không hiểu nhiều vẫn xem là hiểu")
- Mỗi màn có khung **Tóm tắt nhanh** (câu tự sinh): tình hình chung, thị trường chính, biến động lớn, nhà cung cấp chính; bên So giá:
  tiết kiệm tổng, 3 việc làm trước, báo giá gửi về rẻ hơn ở đâu, số nước chưa có gói riêng, nhắc "mới là so giá nhập — còn chất lượng
  mạng, KYC, MOQ". Nút **Giải thích từ ngữ** (`market-help.tsx`).
- Màn So giá có khối **Việc nên làm**: gộp theo thị trường × (nhà cung cấp hiện tại → nhà cung cấp rẻ hơn), số sản phẩm, % rẻ hơn, ví
  dụ 2 sản phẩm, tiền/quý; "Xem" lọc biểu đồ + bảng đúng nhóm. Bỏ thẻ kỹ thuật (kiểm chứng công thức, SKU so được) → vào "Cách tính".
- Nhãn tiếng Việt: Lãi gộp/Biên lãi (thay GP/GM%), Ước cả quý (thay Dự phóng ×), So quý trước (thay %QoQ), Nhà cung cấp, Loại SIM
  (eSIM / SIM vật lý / Nạp thêm data), Kiểu gói (Theo ngày / Trọn gói / Không giới hạn), Gọi/SMS. Tiền ở màn So giá thống nhất VND
  (USD chỉ trong tooltip công thức). Trục biểu đồ xếp hạng là mô tả gói ("Nhật Bản · eSIM · Không giới hạn · 15 ngày"), mã SKU vào tooltip.
- Tên thị trường `lib/market-names.ts`: 1 nước = tên tiếng Việt; 2–3 nước nối tên; ≥ 4 nước = "Châu Âu · 34 nước (E33)" (châu lục
  ≥ 75% theo `ref_countries.continent`, không thì "Nhiều khu vực"). SKU không 13 ký tự = "Khác (mã cũ / phí)", bỏ khỏi tóm tắt.
- Unlimited: không đề xuất gói bị bóp tốc độ thấp hơn gói đang bán (WM ghi `throttle_kbps` 5000/10000; SKU A/E/H = 5Mbps, B/G/X = 10).

## 9. Chỉ so giá vốn mỗi gói (s225, Hiếu chốt)
- Hiếu: "chỉ cần so sánh giá COGS của gói, không cần nhân với số bán". Giao diện So giá bỏ mọi chỉ số "tiết kiệm/quý" (= chênh × số lượng
  bán). Giờ: số gói có nơi nhập rẻ hơn, % rẻ hơn mỗi gói (trung vị / nhiều nhất), chênh mỗi gói (đ). Việc nên làm xếp theo số gói rồi %
  rẻ hơn trung bình; biểu đồ thị trường = số gói rẻ hơn theo nơi rẻ nhất; top 15 = % rẻ hơn. Báo giá gửi về: "rẻ hơn ở N gói, trung bình X%".
- Danh sách gói đem so vẫn là gói CÓ BÁN trong quý đang chọn (số lượng chỉ dùng để chọn gói, không nhân). Server vẫn trả `saveQuarterVnd`
  (không hiển thị).

## Verify (2026-10-06, staging)
- Q3-2026 theo tháng khớp Quarter Report: T8/T9 khớp tới đồng; T7 lệch 161 nghìn / 8,05 tỷ (Quarter Report lọc thêm KH loại trừ).
- Payload Q3 ALL ~1,4MB, 5.596 SKU, ~5s khi tính mới.

## Gotchas
- Chế độ Fulfillment cố định (không có toggle Created — cần GP).
- `units` cộng theo SKU; không có số đơn ở cấp thị trường (COUNT DISTINCT theo SKU cộng lại sẽ đếm trùng).
- QA giao diện mục So giá vendor CHƯA chụp được (Chrome bị extension khác chặn) — đã kiểm số qua API.
- Bộ lọc KH Ops/KH loại trừ (`quarterly_excluded_customers`) CHƯA áp — số = doanh thu B2B+B2C thô trừ ship/nội bộ.
