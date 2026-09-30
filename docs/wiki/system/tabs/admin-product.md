---
title: "Admin Product (Quản Trị Sản Phẩm & Hệ Thống)"
page_type: tab_guide
is_hidden: true
department: product
tags: [tab, admin, product]
created: 2026-06-28
updated: 2026-09-07
status: active
---

# Admin Product (Quản Trị Sản Phẩm & Hệ Thống)

Trang cấu hình kỹ thuật sâu dành riêng cho quản trị viên bao gồm thiết lập luật đích SKU, phân loại nhóm cấp bậc đại lý và đồng bộ hạ tầng.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/admin` (`web/src/app/(dashboard)/admin/page.tsx`) — gồm các tab: Cài đặt, Khuyến mãi, Lịch Lark (tab "Tạo template" đã xoá 2026-09-30, Hiếu sẽ làm lại bản mới).
- **s196+21 (2026-09-14) — tách file 2120 dòng (file lớn nhất repo) thành 7 file, quyết định Hiếu**:
  6 tab vốn đã tự thân là 1 component riêng trong file cũ — chỉ cần tách mỗi tab ra 1 file + nạp qua
  `next/dynamic` (code-split, cùng pattern recharts s196+21), KHÔNG đổi logic/UI (cùng nguyên tắc Phase 5
  quarterly/channels/to-gau/my-metrics). `page.tsx` (shell + tab bar) còn **116 dòng**. File mới:
  `settings-tab.tsx`, `template-tab.tsx` (lớn nhất, ~1019 dòng — sinh template WM/3HK), `promotions-tab.tsx`,
  `scheduled-tab.tsx`, `ref-import-tab.tsx`, `api-keys-tab.tsx`, `admin-types.ts` (type `AppSetting` dùng
  chung giữa Settings + Template). tsc + lint (0 lỗi mới) + vitest (243/243) PASS ngay lần đầu (không phải
  sửa lỗi import sau khi tách — icon/type mapping đúng theo phạm vi dòng gốc).
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

### A. SKU Destination Rule (Luật Đích SKU) — ĐÃ CHUYỂN sang Settings (s82)
- Mục cấu hình luật đích SKU trước ở đây **trùng** với "SKU Destination Definition" trong `/analytics/settings` (cùng key `sku_destination_rules`). (s82) Đã gỡ khỏi Admin, giữ ở Settings.
- ⚠️ Thực tế: destination hiện **tính cứng theo HỌ SKU trong code** (`getDestinationSQL` ở `lib/analytics-helpers.ts`: digit→ký tự 3-5, E→2-4, 3-letter→1-3) rồi map tên nước qua Turso `country_codes`. Cấu hình trong Settings mang tính tham chiếu/dự phòng, KHÔNG trực tiếp điều khiển báo cáo hiện tại.
- `/admin` Cài đặt giờ chỉ còn: **Tỷ giá nội bộ** + **Công thức 3HK Datapool**.

### B. Partner Tiers (Channel & Customer Tiers) — ĐÃ CHUYỂN sang Settings (s82)
- Mục "Channel & Customer Tiers" trước ở đây **trùng** với "Đối tác chiến lập (Partner Tiers)" trong `/analytics/settings` (cùng API `/api/config/partner-tiers`).
- (s82) Đã **gộp về Settings**, lấy UI bản admin (đẹp hơn: thêm/xóa nhóm tier, datalist gợi ý tên kênh, lưới card). Admin KHÔNG còn mục này.

### C. Nút Kiểm soát Đồng bộ (Manual Triggers)
- Kích hoạt sync Lark/Turso hoặc **xoá cache** (`/api/admin/flush-analytics-cache` → bảng `analytics_query_cache`).
- **Tạo template** SP: đã xoá hẳn 2026-09-30 (tab Admin `template-tab.tsx`, API `/api/admin/template`, agent chatbot `tao-template`) — Hiếu làm lại bản mới.

### D. Nơi lưu cấu hình (Supabase `app_settings`)
Mọi config admin/settings lưu ở **`app_settings`** dạng key→value: `fx.usd_vnd`/`fx.hkd_usd`/`fx.twd_usd` (tỷ giá — nguồn cho tỷ giá B2C + COGS chatbot), `3hk.*` (công thức 3HK), `partner_tiers`, `sku_destination_rules`, `role_permissions`, `b2c_kpi_targets`. → sửa 1 chỗ, cả hệ dùng chung.

---

## 3. Phân Quyền
- Cực kỳ nghiêm ngặt: **CHỈ dành cho tài khoản có vai trò `admin` hoặc `creator`**.
- Mọi vai trò khác như Standard, Staff, BOD hay Manager đều không thể xem hay tương tác với trang này (hệ thống sẽ tự động chuyển hướng - redirect về trang chủ chatbot nếu cố tình truy cập).\n

## 4. API sản phẩm cho hệ thống bên ngoài (tab "API bên ngoài", s195+4, 2026-09-07)

Cho phép cấp API key (server-to-server, KHÔNG dùng session cookie) để 1 hệ thống bên ngoài (vd tool
manager tự xây) đọc catalog sản phẩm/SKU — bao gồm **giá vốn/COGS**.

- **2 endpoint đọc**: `GET /api/external/products`, `GET /api/external/skus` — auth
  `Authorization: Bearer <key>` (helper `web/src/lib/external-api-auth.ts` `requireExternalApiKey()`).
  Field list RIÊNG, tách hẳn khỏi `/api/products`/`/api/skus` (route UI nội bộ) — sửa UI nội bộ sau này
  KHÔNG vô tình đổi field trả cho bên ngoài. `skus` trả kèm `latest_cogs`/`latest_cogs_currency`. Phân
  trang `page`/`page_size` (mặc định 20, tối đa 200 — cao hơn route UI để bên ngoài kéo hàng loạt đỡ tốn
  round-trip). Rate limit 60 req/phút/key (`checkRateLimit`, key theo `label`).
- **Quản lý key**: tab "API bên ngoài" trong `/admin` (admin/creator) — tạo key mới (nhập label nhận biết,
  vd "Manager - CRM tool") → key thật CHỈ hiện đúng 1 lần lúc tạo (giống Stripe/GitHub PAT), sau đó chỉ lưu
  **hash SHA-256** (`external_api_keys.key_hash`, KHÔNG lưu plaintext — khác token Bridge cá nhân
  `app_settings` plaintext vì đây là credential giao cho hệ thống ngoài công ty, giá trị rủi ro cao hơn).
  Thu hồi (revoke) giữ lại row làm audit trail, không xoá cứng. Route quản lý:
  `GET/POST/DELETE /api/admin/external-api-keys`.
- Migration `v52_external_api_keys.sql`. KHÔNG đụng `/api/mcp` (`MCP_SECRET`) — kênh đó vốn đã lộ COGS qua
  `search_products`/`get_sku_detail` nhưng dùng 1 secret tĩnh chung cho mục đích khác (Claude Code dev
  tool), không tách theo từng bên nhận — cố ý KHÔNG dùng lại cho manager, tránh trộn 2 mục đích vào 1
  secret không revoke riêng được.


## Tab "Tạo sản phẩm" (BC Datapool) — s215, 2026-09-30

Thay tab "Tạo template" đã xoá. Hiện chỉ có vendor **BC Datapool** (2 pool: CMHK = `WD` tính HKD, Singtel = `W1` tính USD); vendor khác làm sau.

**Luồng**: upload bảng báo giá (sheet `cmhk` + `Singtel`, lưu `app_settings` key `bcdp.price_list`, dùng lại lần sau) → chọn pool/SIM/khu vực/nhà mạng → nhập gói (loại Daily/Fixed/Unlimited, dung lượng, danh sách ngày, ProductID) → **Xem trước** (5 tab: Tính giá, SKU US, SKU VN, Product US, Product VN + cảnh báo) → **Xuất file Excel** (đúng 4 sheet `Template_sku_US/VN`, `Template_product_US/VN` của `Format_add_new_packages.xlsx`).

**Công thức COGS** (bảng COGS BC Datapool, dùng chung 2 pool, chỉ khác tỷ giá): Fixed = tổng GB × giá/GB × 55% · Daily = GB/ngày × ngày × giá/GB × 38% · Unlimited = 1.7GB × ngày × giá/GB (không nhân %). Nhiều nhà mạng → lấy nhà mạng ĐẮT NHẤT đã chọn. Phí khung = phí eSIM 2 CNY (SIM: phí thẻ SIM) + IMSI 0.5 (HKD với CMHK, USD với Singtel), làm tròn gần nhất 2 số lẻ. COGS eSIM full = data + phí khung; VN = USD × tỷ giá VND, làm tròn lên. Làm tròn lên 2 số lẻ ở tiền của pool rồi quy USD rồi làm tròn lên lần nữa (đúng file mẫu). Tỷ giá HKD/CNY/VND lấy từ **Tỷ giá nội bộ** (`app_settings` `fx.hkd_usd`, `fx.usd_cny`, `fx.usd_vnd`).

**Mã**: Product = ký tự1 (US=`E`, VN=`3`) + loại (eSIM `C`, SIM `E`) + mã nước 3 ký tự + vendor (`WD`/`W1`) + policy (Daily `T`, Fixed `F`, Unlimited `X`). SKU = Product + dung lượng 3 ký tự (500MB→`5HM`, 1.5GB→`1D5`, 5GB→`005`) + ngày 2 ký tự. `vendorSku` US = ProductID BC (1 ProductID/gói dung lượng, dùng chung mọi ngày), `vendorSku` VN = mã SKU US. Unlimited: dung lượng nhập = GB tốc độ cao/ngày (chỉ để đặt tên/mã, giá tính theo 1.7GB).

**Code**: `lib/bc-datapool/` (`pricing.ts`, `codes.ts`, `builder.ts`, `price-list.ts`, `server.ts`), API `/api/admin/bc-datapool` (+ `/price-list`, `/build`, `?format=xlsx`), UI `admin/product-builder-tab.tsx`. Test `__tests__/bc-datapool.test.ts` đối chiếu TOÀN BỘ SKU 2 file mẫu (Taiwan/Cambodia/Laos 343 SKU + Japan) — khớp COGS US/VN từng dòng (chỉ chạy khi file mẫu có ở repo root).

**Gotchas**: file mẫu Taiwan định dạng tên `500MB`, Japan `500 MB` — tool dùng kiểu Japan (có khoảng trắng). Không xuất cột `sync GC`/`tên VAT`; `Purchase Formula*` để trống.

### s215+1 — Tự lấy ProductID từ file Portal "Purchase information"

2 file `Purchase information.xlsx` (eSIM) và `Purchase information (1).xlsx` (SIM) xuất từ Portal BC Datapool: **`Plan ID` = ProductID** (đã đối chiếu 25/25 ID trong file mẫu Taiwan/Japan đều có). Mỗi sheet `Daily Data eSIM/SIM`, `Fixed Data eSIM/SIM` (+ `Top-Up eSIM` — bỏ qua) liệt kê Plan ID × các số ngày Portal thực sự bán. **Pool nhận diện qua APN trong mô tả**: `cmhk` = CMHK (WD), `e-ideas` = Singtel (W1).

Upload ở thẻ "Danh mục gói Portal" (lưu `app_settings` key `bcdp.plan_catalog`, ~190KB/712 gói, loại SIM nào có trong file upload thì thay hẳn loại đó). Khi Xem trước/Xuất, ô ProductID để trống → server tự tra theo (eSIM/SIM, Daily/Fixed, nước, pool, dung lượng); nhập tay vẫn được ưu tiên. Cảnh báo (chặn xuất): không tìm thấy gói; Portal có >1 Plan ID cho cùng gói (VD Indonesia Daily — KHÔNG tự đoán); **Portal không bán số ngày đã chọn**. Unlimited không có trong Portal → luôn nhập tay. Gói đa vùng ("Global 12 Destinations"...) chưa hỗ trợ. Tên nước Portal ↔ bảng giá được gộp qua `canonCountry()` (Taiwan (China)=Taiwan, U.S.A=United States, Columbia=Colombia, Macau=Macao...). Code: `lib/bc-datapool/plan-catalog.ts`, API `/api/admin/bc-datapool/plan-catalog`.

**Điểm lệch phát hiện khi đối chiếu (chưa sửa, đã hỏi Hiếu)**: (1) file Japan mẫu dùng ProductID `1786346622046927` cho SKU "Unlimited 10mbps 3GB" nhưng Portal ghi gói đó là "Japan-Daily 6GB — Throttle to 1Mbps" (1024kbps); (2) Portal ghi Timing Rule `Natural Day` (reset 00:00 UTC+8) cho Japan nhưng `24-Hour` cho Taiwan/Cambodia..., trong khi file mẫu dùng policy `T` (reset nửa đêm) cho cả hai — theo wiki `ma-sku` thì `T`=reset nửa đêm, `P`=không reset nửa đêm.

### s215+2 — Chốt nghiệp vụ Unlimited / reset time / SIM (Hiếu xác nhận 2026-09-30)

- **Unlimited (mã X)**: BC KHÔNG có gói Unlimited riêng. Nội bộ hiểu = N GB tốc độ cao + N GB @10Mbps + không giới hạn @1Mbps; phía BC gộp thành gói **"Daily 2N GB — Throttle to 1Mbps"** (1024kbps, có ở ~30 nước); khách thấy "N GB tốc độ cao, Unlimited 10Mbps". Tool tự tra ProductID = gói Daily dung lượng ×2 có `throttleKbps=1024` trong file Portal (Japan 3GB → `1786346622046927`). Giá vẫn tính 1.7GB/ngày × giá/GB × ngày. Catalogue cần upload lại file Portal sau s215+2 (thêm trường throttle).
- **dailyResetTime**: Daily và Unlimited = `GMT+8` (reset nửa đêm, policy T/X); Fixed = `Count 24h` (policy F). File mẫu ghi GMT+8 cho cả Fixed là NHẦM (DB 3HK Fixed cũng dùng `Count 24h`). Portal ghi Timing Rule Natural Day/24-Hour nhưng tool không dùng để đổi policy T/F.
- **SIM (vật lý)**: sinh 2 loại, cả US lẫn VN — **datapack (A)** (`EA…`/`3A…`, skuType `Datapack`, ProductID ở `vendorSkuSim` theo tiền lệ `3AAS8WDT`/`EAAS8WDT`, COGS = chỉ data) và **SIM full (E)** (`EE…`/`3E…`, skuType `Base + Datapack`, `frameSku` = khung SIM, `datapackSku` = mã A tương ứng, vendorSku trống). Khung SIM dùng chung CMHK + Singtel: VN `1D000WDK00000` (có trong DB, Preparing, `latest_cogs` 16.028 VND), US `CD000WDK00000` (theo quy ước CD000…K00000, CHƯA có trong DB — tool cảnh báo). **Phí SIM = giá SIM trắng (đọc `latest_cogs` của khung VN trong DB, đổi USD theo tỷ giá nội bộ) + phí IMSI**; COGS SIM full = phí SIM + data.
- **Portal có nhiều Plan ID giống hệt nhau** (Indonesia W1 Daily: ID cũ `17865918…` viết "daily" và ID mới `17906710…` viết "Daily", cùng nhà mạng XL/timing/số ngày): tool tự chọn ID MỚI NHẤT và ghi chú ⚠ trên dòng; muốn ID kia thì nhập tay. Nếu các gói khác nhau thật (nhà mạng/timing/ngày) → báo mơ hồ, không đoán.
- Top-Up: tạm thời KHÔNG tạo.

**s215+3 (Hiếu chốt)**: SIM full (E) CHỈ bán ở đầu VN → chỉ sinh SKU/Product `3E…` (frameSku `1D000WDK00000`, datapackSku `3A…`); KHÔNG có khung US, KHÔNG có `EE…`. Datapack (A) vẫn sinh cả `EA…` (US) lẫn `3A…` (VN) vì SKU VN trỏ về mã US ở `vendorSkuSim`. Giá SIM trắng (`latest_cogs` của `1D000WDK00000`, hiện 16.028 VND) là giá CHƯA gồm IMSI → phí SIM = giá SIM trắng + IMSI (đúng như tool đang tính, không cộng đôi).

### s215+4 — File xuất giữ CÔNG THỨC + báo thay đổi khi upload

**File xuất (Excel)**: 4 sheet template + thêm sheet **"Tính giá"** (như file mẫu của Hiếu có sheet tính riêng). Ô `latestCogs` ở `Template_sku_US`/`Template_sku_VN` là **công thức** `='Tính giá'!P{n}` / `Q{n}` (kèm giá trị đã tính sẵn nên importer đọc giá trị vẫn được). Sheet "Tính giá" mỗi dòng 1 SKU, từng bước là công thức Excel: Data tiền pool `ROUNDUP(giá/GB × GB × ngày × %,2)` → Data USD `IF(HKD, ROUNDUP(/HKD-USD,2), giữ)` → Phí khung → COGS US `ROUND(data+phí,2)` → COGS VN `ROUNDUP(×VND-USD,0)`. Tham số dùng chung ở cột S:T (HKD/USD, CNY/USD, VND/USD, Fixed %, Daily %, Unlimited GB/ngày, giá SIM trắng, IMSI/phí eSIM từng pool, 4 ô phí khung) — sửa tham số là mọi giá tự đổi. Test `bc-datapool-export.test.ts` có bộ tính công thức mini tính lại TOÀN BỘ công thức trong file và so với giá trị ghi sẵn (khớp 1e-9), và đọc lại file .xlsx đã ghi vẫn còn công thức.

**Báo thay đổi khi upload** (`lib/bc-datapool/diff.ts`): mỗi lần upload bảng giá / file Portal, server so với bản đang lưu và trả `lastDiff` (lưu kèm trong `app_settings` nên mở lại vẫn thấy):
- **Bảng giá**: nhà mạng đổi giá (từ→đến), nhà mạng/khu vực mới, bị bỏ, đổi phí IMSI/eSIM/SIM (CNY), đổi tiền tệ pool.
- **File Portal**: gói mới (Plan ID mới), gói bị bỏ, gói đổi số ngày bán/tốc độ sau ngưỡng/nhà mạng/timing. Chỉ so trong loại SIM có upload (chỉ upload eSIM thì gói SIM cũ không bị coi là bỏ; bản cũ chưa lưu throttle không tính là đổi).
- Hiển thị: thông báo ngay sau upload + hộp "Thay đổi so với bản trước" (bấm từng nhóm xem chi tiết) dưới từng thẻ upload; lần upload đầu ghi rõ chưa có bản cũ. Có thay đổi thì tạo thêm **thông báo chuông** cho admin/manager (`price_change` cho bảng giá, `sync` cho Portal).
- **Không tự sửa** sản phẩm/giá đã tạo trước đó: hộp nhắc "sản phẩm/giá đã tạo có thể cần cập nhật" — người dùng tự quyết.

### s215+5 — Mọi công thức chỉ ROUNDUP + rê chuột xem công thức

- **Quy định (Hiếu 2026-09-30): mọi công thức dùng ROUNDUP, không dùng ROUND.** Phí khung trước đây làm tròn gần nhất (0.36 cho CMHK) → nay ROUNDUP: CMHK eSIM `2/6.687 + 0.5/7.801 = 0.3632 → 0.37`; Singtel `2/6.687 + 0.5 = 0.7991 → 0.80` (không đổi). Hệ quả: mọi giá CMHK cao hơn file mẫu Japan (gõ tay 0.36) đúng **0.01 USD** (VN ≈ +265 VND); Singtel/Taiwan/Cambodia/Laos vẫn khớp file mẫu tuyệt đối (test `bc-datapool.test.ts` cho phép Japan chênh đúng 0..+0.01). COGS US = `ROUNDUP(data + phí khung, 2)`.
- **Xem trước**: rê chuột vào giá (gạch chấm) hiện công thức đã thế số — tab "Tính giá": giá/GB, Data (USD), Phí khung, COGS US, COGS VN; tab SKU US/SKU VN: ô `latestCogs`. Chuỗi sinh ở `lib/bc-datapool/explain.ts`, cùng công thức với sheet "Tính giá" của file xuất. Test khoá: không công thức nào (file xuất lẫn chuỗi tooltip) chứa `ROUND(` trần.

### s215+6 — SKU/Product đã có trong hệ thống: báo kèm mã, bỏ đi, tạo phần còn lại

Khi Xem trước/Xuất, server tra hệ thống (`skus.sku_code`, `products.product_code`, gom theo lô 100 — không N+1, kèm `status`) rồi `dropExisting()` (`lib/bc-datapool/dedupe.ts`):
- SKU đã có (từng tenant US/VN riêng) → **bỏ khỏi bản xem trước và file xuất**, hiện hộp xanh "Đã có trong hệ thống — sẽ KHÔNG tạo lại" liệt kê từng mã + tenant + trạng thái (Active/Inactive/Deleted…) + gói (VD `ECCHNWDT00110 (US, Active) — eSIM full · Daily 1GB × 10 ngày`), kèm số SKU sẽ tạo mới. Chọn 10,11,12 ngày mà 10 đã có → chỉ tạo 11 và 12.
- Product đã có → không tạo lại dòng Product, vẫn thêm SKU mới.
- Đây là thông báo, KHÔNG còn chặn xuất. Chỉ khi TẤT CẢ SKU đã có thì xuất trả lỗi "không còn gì để tạo mới".
- Dòng "Tính giá" / công thức Excel được đánh lại chỉ số sau khi bỏ, test kiểm công thức vẫn trỏ đúng dòng và tính lại khớp.

### s215+8 — Bảng "Tỷ Giá Nội Bộ" theo THÁNG × PHÁP NHÂN + quy tắc chiều đổi

**Trước**: chỉ có 1 bộ khoá phẳng `fx.*` (nhãn ghi "T06/2026" dù giá đã T09; nhãn `fx.hkd_usd` ghi "USD / 1 HKD" nhưng giá trị 7.801 thật ra là HKD cho 1 USD). Hệ quả **lỗi thật ở chatbot**: `convertCogs`/`tools.ts` nhân COGS HKD/TWD với `fx.hkd_usd`/`fx.twd_usd` (mặc định kiểu 0.128) trong khi DB lưu 7.801/31.666 → COGS HKD/TWD đổi USD sai ~60 lần; VND→USD cũng dùng chung 1 tỷ giá.

**Nay**: Admin › Cài đặt › "Tỷ Giá Nội Bộ theo tháng" = lưới **13 dòng × 24 tháng (T01/2026…T12/2027)** đúng file `Tỷ giá nội bộ theo tháng.xlsx` (2 pháp nhân: **Gohub JSC** — VND/USD, VND/CNY, VND/HKD, VND/GBP; **Gohub Inc** — VNĐ/USD, HKD/USD, JPY/USD, THB/USD, CNY/USD, EUR/USD, GBP/USD, SGD/USD, TWD/USD). Sửa từng ô (ô sửa tô vàng, nút Lưu N ô) hoặc **Nhập từ Excel** (ô có trong file ghi đè, ô không có giữ nguyên; báo danh sách ô đổi + thông báo chuông). Rê chuột vào ô xem % biến động MoM. Dữ liệu: `app_settings` key `fx.monthly` (JSON, category `fx_monthly`); API `/api/admin/fx` (GET/PUT/POST); code `lib/fx/table.ts` (thuần), `parse.ts` (đọc Excel — nhận diện dòng theo cột A vì file có nhãn B gõ nhầm "VND/GBP" ở dòng HKD), `server.ts`.

**Quy tắc chiều đổi (Hiếu chốt)**: **USD→VND dùng tỷ giá JSC** (VD 26.266); **VND→USD dùng tỷ giá Inc** (VD 25.731,22); USD↔HKD/CNY/JPY/THB/EUR/GBP/SGD/TWD dùng tỷ giá Inc (cả 2 chiều); VND↔CNY/HKD/GBP dùng tỷ giá JSC (chưa có dòng đó thì đổi qua USD); cặp khác đổi qua USD. **Tháng áp dụng** = tháng hiện tại; chưa nhập thì lấy tháng gần nhất TRƯỚC đó (không lấy tương lai). Hàm `convert()` trả kèm các bước (dòng, tỷ giá, tháng, phép tính).

**Tương thích ngược**: mỗi lần lưu, bảng tự ghi xuôi sang khoá phẳng `fx.*` (giá tháng hiện tại) — chatbot/MCP/`admin-gohub` đọc `fx.*` chạy như cũ; thêm `fx.vnd_usd_inc` (VND→USD, Inc) và `fx.vnd_hkd`. **Quy ước khoá phẳng chốt lại: "số đơn vị ngoại tệ cho 1 USD"** (fx.hkd_usd=7.801) → ngoại tệ→USD là CHIA; `lib/fx/flat.ts` `convertCogsFlat()` dùng chung cho `context.convertCogs` và `tools.ts` (VND gốc giữ nguyên số VND, VND→USD dùng `fx.vnd_usd_inc`). Chưa nhập bảng theo tháng thì `loadEffectiveTable()` dựng tạm từ khoá phẳng cũ (VND→USD dùng chung tỷ giá JSC).

**Tab Tạo sản phẩm (BC Datapool)** dùng đúng quy tắc trên: COGS VN = USD × VND/USD **JSC**; giá SIM trắng (VND) → USD ÷ VND/USD **Inc**; phí eSIM/IMSI quy USD bằng CNY/USD, HKD/USD **Inc**. File xuất có 2 ô tham số riêng (T4 = JSC, T9 = Inc). Thẻ "Tỷ giá" hiển thị từng chiều + tháng đang dùng.

### s215+9 — "Công Thức Datapool" dùng chung + bỏ thông báo Lark của staging

- **Công thức Datapool** (Admin › Cài đặt): đổi tên từ "Công Thức 3HK Datapool" → "Công Thức Datapool (dùng chung 3HK, BC Datapool...)". 5 dòng, key `datapool.*`: `fixed_factor` 0.55 · `daily_factor` 0.38 · `unlim_500mb_5mbps_gb_day` 1.6 · `unlim_500mb_10mbps_gb_day` 1.8 · **mới** `unlim_3gb_10mbps_gb_day` 1.7 (3GB tốc độ cao + Unlimited 10Mbps = 3GB tốc độ cao + 3GB 10Mbps + Unlimited 1Mbps). Trước đó 1.6/1.8 nằm ở `3hk.unlim_5mbps_gb_day`/`3hk.unlim_10mbps_gb_day` (đúng là cho dạng 500MB + Unlimited 5/10Mbps). Key cũ `3hk.*` vẫn được đọc làm giá trị dự phòng (`lib/datapool-formula.ts` `resolveFormula()`: `datapool.*` → `3hk.*` → mặc định), lưu lần đầu sẽ tạo dòng `datapool.*` (PATCH tự gắn label + category `formula`).
- **Người dùng**: chatbot tool `calculate_3hk_cogs` (thêm `data_type: "unlim_3gb_10mbps"`) và tab Tạo sản phẩm BC Datapool (giả định mặc định Fixed %, Daily %, Unlimited GB/ngày = 1.7 lấy từ đây). Sửa luôn lỗi cùng loại tỷ giá ở tool này: `cogs_usd = cogs_hkd × fx.hkd_usd` (nhân 7.801) → nay dùng `convertCogsFlat` (chia).
- **Lark thông báo release**: `.github/workflows/notify-release.yml` chỉ chạy khi push `main` (production); push `staging` không báo nữa (yêu cầu Hiếu 2026-09-30, thay quyết định s200+11 báo cả 2 môi trường). Tin production vẫn kèm danh sách commit còn nằm trên staging chưa merge.
