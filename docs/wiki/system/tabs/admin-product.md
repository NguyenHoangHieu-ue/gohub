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
  `ref-import-tab.tsx`, `api-keys-tab.tsx`, `admin-types.ts` (type `AppSetting` dùng
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

### s216 — 2 cột mới `dataMB` + `speedMbps` ở 2 sheet SKU; Unlimited chọn tốc độ cao + tốc độ

- **2 cột mới** ngay bên phải `throttleSpeed` ở `Template_sku_US` / `Template_sku_VN` (cột chữ: `throttleSpeed`=M, `dataMB`=N, `speedMbps`=O, `call`=P, `callSmsDetails`=Q, `expirations`=R, `vendorSku`=S, `vendorSkuSim`=T, `SKU CODE`=U — SKU CODE dịch từ S sang U): thứ tự `throttleSpeed, dataMB, speedMbps, call, callSmsDetails, expirations, vendorSku, vendorSkuSim, SKU CODE`. Chỉ áp dụng gói **Unlimited** (Daily/Fixed để trống): **`dataMB`** = số MB tốc độ cao khách thấy (3GB → **3072**, 500MB → 500), **`speedMbps`** = tốc độ Unlimited (10 hoặc 5). Ô latestCogs vẫn cột K. Test khớp template gốc + 2 cột mới; các test so file mẫu ánh xạ lại vị trí cột.
- **Ngữ cảnh**: BC chỉ bán "Daily {tổng}GB Throttle to 1Mbps" (tổng luôn 6GB). Nội bộ có thể là 3GB tốc độ cao + 3GB@10Mbps + Unlimited 1Mbps, hoặc 500MB tốc độ cao + 5.5GB@10Mbps (hoặc @5Mbps) + Unlimited 1Mbps; khách thấy "500MB tốc độ cao, Unlimited 10Mbps". Vì vậy **dung lượng tốc độ cao và tốc độ là thông tin nội bộ, KHÔNG dùng để tra ProductID** — ProductID luôn là gói BC Daily {tổng} Throttle 1Mbps (form có ô chọn "Gói BC" riêng, `bcAmount`/`bcUnit` trong `PlanLine`).
- **Form (dòng Unlimited)**: thêm ô "Dung lượng TỐC ĐỘ CAO khách thấy" (số + MB/GB) và "Tốc độ Unlimited" (10/5 Mbps), **mặc định 3GB + 10Mbps**; hiển thị ngay "Hiển thị cho khách…/dataMB=…/speedMbps=…".
- **Hệ số GB/ngày Unlimited — chốt lại (Hiếu 2026-09-30)**: kiểu cũ *1 mốc tốc độ cao + Unlimited* (1.6 cho 500MB+5Mbps, 1.8 cho 500MB+10Mbps) **KHÔNG còn dùng cho BC Datapool**; từ nay gói Unlimited chuyển hết sang kiểu **2 mức throttle** (tốc độ cao + phần 5/10Mbps + Unlimited 1Mbps) để tối ưu chi phí. Hiện chỉ có **1 mức: 3GB tốc độ cao + 3GB 10Mbps + Unlimited 1Mbps = 1.7** (`datapool.unlim_3gb_10mbps_gb_day`); sau này sẽ thêm nhiều giả định mức khác → bảng `UNLIMITED_PROFILES` trong `lib/bc-datapool/types.ts` (thêm 1 dòng + 1 giả định ở Công Thức Datapool là xong). Tổ hợp (dung lượng tốc độ cao, tốc độ) không thuộc mức nào → cảnh báo "chưa có hệ số GB/ngày…" (chặn xuất, form cũng báo đỏ ngay), không đoán. 1.6/1.8 vẫn nằm ở Công Thức Datapool nhưng gắn nhãn "(kiểu cũ)" và chỉ 3HK/chatbot dùng. File xuất: ô hệ số Unlimited duy nhất T7.
- **Mã & tên — chốt lại**: Unlimited **chỉ dùng mã `X`** (bỏ ý tưởng 5Mbps = `A`; nếu sau này phát sinh mã khác sẽ thêm khi có yêu cầu); mã SKU dùng dung lượng tốc độ cao (3GB → `003`). **Giữ tên cũ** cho mọi SKU Unlimited: "eSIM {nước} Unlimited {tốc độ}mbps {N} ngày" / "eSIM {country} Unlimited {tốc độ}mbps {N} Day(s)" (không chèn dung lượng tốc độ cao). `throttleSpeed`: "{N} of high-speed data per day, then unlimited data at {tốc độ}Mbps".

### s219 — Gói ĐA VÙNG (nhiều nước trong 1 gói Portal)

- **Trước**: `parseSheet` bỏ hết gói đa vùng ngay khi đọc file Portal (`Single or Multiple Region` ≠ Single) và mọi hàm tra cứu bắt `countries.length === 1` → web không có ME 4, Asia 5/8 Destinations, Global 12, Singapore-Malaysia-Indonesia-Thailand, South America 4, China-HK-Macau(-Taiwan)...
- **Nay**: danh mục giữ cả gói đa vùng (`countries` = toàn bộ nước của gói). `regionKey()` (`lib/bc-datapool/plan-lookup.ts`) = các nước chuẩn hoá, sắp xếp, nối `+` — không phụ thuộc thứ tự; nước đơn vẫn là tên chuẩn hoá nên mọi chỗ cũ chạy như cũ. `findPlans/offers/availableKinds/manualMismatches/resolvePlans` nhận `coverage: string | string[]`. `multiRegions()` liệt kê gói đa vùng (nhãn = tên nhóm Portal lấy từ tên gói, VD "ME 4 — Saudi Arabia, Turkey, Egypt, UAE").
- **Form**: ô Khu vực có thêm nhóm "Gói đa vùng" (chỉ hiện khi MỌI nước của gói đều có giá trong bảng giá của pool đó). Chọn xong tự điền: nhà mạng của tất cả nước (giá = nhà mạng ĐẮT NHẤT trong toàn bộ nước), **mã nhóm 3 ký tự tra từ nhóm nước hỗ trợ có sẵn** (`ref_support_countries`), KHÔNG tự đặt: đổi từng nước Portal sang ISO2 (alias Macau/Macao, UAE, East Timor, Columbia...; `pickSupportGroup()` ở `lib/bc-datapool/iso.ts`) rồi tìm nhóm có tập `country_codes` **khớp đúng — không thừa, không thiếu**. Khớp 1 nhóm → tự điền mã + `supportedCountries` + tên EN/VN của nhóm (ME 4 → `STE`); nhiều nhóm cùng tập nước (SG-MY-ID-TH → AS4/AS5/SEA) → để trống mã, báo danh sách để chọn; không nhóm nào (South America 4, Asia 5, China-HK-Macau-Taiwan, Global 12 — kiểm với dữ liệu thật 2026-10-02) → để trống mã, báo cần tạo nhóm trước. Căn cứ là cột `country_codes`, không phải cột tên (một số nhóm cũ có tên và mã lệch nhau, VD ASI, A10). Tên VN chưa có thì lấy tên EN của nhóm. Sửa tay được.
- **File xuất**: `onsiteCarrier` của gói đa vùng mỗi nước 1 dòng `Nước: nhà mạng/nhà mạng` (như file mẫu); nước đơn không đổi. ProductID tự tra theo (SIM, pool, nhóm nước, loại, dung lượng); Unlimited đa vùng dùng gói Daily 6GB Throttle 1Mbps của nhóm (ME 4, South America 4 có).
- Portal API `/api/admin/bc-datapool` trả thêm `name` cho từng gói. Test: `bc-datapool-portal.test.ts` (Portal thật) + `bc-datapool-export.test.ts` (build đa vùng).
- **Chưa làm / lưu ý**: tên SKU dùng tên sản phẩm nối tất cả nước (Global 12 sẽ rất dài — chưa có tên ngắn); gói có nước KHÔNG có trong bảng giá của pool bị ẩn khỏi danh sách (không báo lý do).

### s231 — Vendor thứ 2: 3HK Datapool (2026-10-12)

- **Giao diện**: đầu tab "Tạo sản phẩm" có ô chọn Vendor (BC Datapool / 3HK Datapool). BC giữ nguyên (`BcDatapoolBuilder`); 3HK là `product-builder-3hk.tsx`. Xem trước + Xuất Excel 4 sheet template + sheet "Tính giá" (ô `latestCogs` là công thức ROUNDUP trỏ sheet này).
- **Code**: `lib/threehk-datapool/` (`builder.ts` mã + giá + 4 sheet, `export.ts` workbook, `resolve.ts` thuần: giá từ ncc_3hk + tra mã nước, `server.ts` đọc DB), API `/api/admin/threehk-datapool` (GET dữ liệu nền) + `/build` (POST xem trước / `?format=xlsx`). Dùng lại `PRODUCT_HEADERS/SKU_HEADERS`, `dataCostPool/dataCostUsd`, `dedupe.ts` (nay generic), `findExisting`, `loadFx/loadAssumptions`.
- **Loại gói** (Hiếu chốt): Fixed `F` (Count 24h) · Daily `P` (Count 24h) hoặc `T` (GMT + 8) · Unlimited `X` (chỉ mức 3GB tốc độ cao → 10Mbps, `GMT + 8`, dataMB 3072/speedMbps 10, hệ số GB/ngày = `datapool.unlim_3gb_10mbps_gb_day`). KHÔNG làm Unlimited A/B kiểu cũ.
- **Giá**: bảng `ncc_3hk` (HKD/GB); gói đa nước = nước đắt nhất. Data (HKD) = công thức Datapool (Fixed % / Daily % × ngày / GB-ngày × ngày), ROUNDUP → ÷ HKD/USD Inc, ROUNDUP. COGS: datapack A (EA/3A) = data; eSIM full C: US = A + khung `AB0003DK00000` (USD), VN = ROUNDUP(US × VND/USD JSC); SIM full E: US (mã `CE…`, source `C`) = A + `CD0003DK00000`, VN `3E…` = ROUNDUP(data USD × JSC) + khung `1D0003DK00000` (VND). Giá khung đọc từ `skus.latest_cogs`; thiếu thì bỏ loại đó + cảnh báo.
- **Mã**: Product = ký tự đầu (VN `3`, US `E`, SIM full US `C`) + loại `A/C/E` + mã nước 3 ký tự + `3D` + policy; SKU = Product + dung lượng 3 ký tự + ngày 2 ký tự. Mặc định theo đầu: **US** eSIM = A + C, SIM = A · **VN** eSIM = C, SIM = A + E. Hai ô tích cho trường hợp đặc biệt (mỗi sản phẩm): "SIM full đầu US" (chỉ khi SIM → thêm `CE…`) và "eSIM data đầu VN" (chỉ khi eSIM → thêm `3A…`). `vendor_expirations` = 60.
- **Trường theo nước (note, KYC, kích hoạt, onsite…)**: copy từ Product 3HK ĐÃ CÓ cùng nước (ưu tiên đúng mã → cùng tenant+loại → cùng tenant); nước chưa có Product nào → dùng mặc định + cảnh báo. Mã nước/nhóm: 1 nước khớp tên (hoặc ISO2) trong `ref_support_countries`, nhiều mã cùng tên → ISO alpha-3; nhiều nước → nhóm khớp ĐÚNG tập nước; không chắc thì để trống + ô nhập tay (không tự đặt mã).
- **`vendorSku` US của gói data để TRỐNG** (mã `CDOF…/TDOF…` của 3HK duy nhất từng SKU, không suy ra được — Hiếu điền tay sau). `vendorSku` VN trỏ về mã SKU US (A: cả `vendorSku` lẫn `vendorSkuSim`; C: `vendorSku`).
- **Hệ số Unlimited (chốt 2026-10-14)**: dùng đúng số Hiếu đã lưu ở Công Thức Datapool (DB lúc kiểm: `datapool.unlim_3gb_10mbps_gb_day` = 2, Daily 0.35) — không đổi code. QA sống 2026-10-14 (Thái/Nhật, eSIM/SIM, F/P/T/X): giá tool = giá SKU cũ trong DB +0.01 USD do chuỗi ROUNDUP (vd Thái X 3GB×15: 19.22 vs 19.21). Nhật Daily VN chênh lớn (48.645 vs 54.187 VND) vì SKU cũ tính theo giá/GB cũ.
- **Nước không ra được sản phẩm**: (1) nước KHÔNG có trong `ncc_3hk` (vd Latvia) → không có giá → chặn, báo "chưa chọn nước nào có giá"; (2) nước có giá nhưng CHƯA có Product 3HK nào để copy khuôn (vd Australia, New Zealand) → vẫn tạo được nhưng note/KYC/kích hoạt dùng mặc định + cảnh báo, Hiếu soát tay; (3) nước lẻ châu Âu (Áo, Bỉ, Pháp...) tra ra nhiều nhóm/không có mã → chọn theo nhóm nước (EU...) hoặc nhập mã nhóm tay.
- **Gotcha cũ (đã hết)**: từng thấy hệ số Unlimited DB ~2.0 vs Công Thức 1.8 — nay Công Thức đã là 2. `daily_reset_time` trong DB lẫn `GMT +8` và `GMT + 8` — tool xuất `GMT + 8`. Test `threehk-datapool.test.ts` (số khớp EA/EC Thái Lan Fixed 5GB: 1.75 / 2.26).

### s233 — Unlimited tự thêm ở Công Thức Datapool (2026-10-14)

- Admin › Cài đặt › Công Thức Datapool có khối **"Các loại Unlimited khác (tự thêm)"**: mỗi mức = dung lượng tốc độ cao/ngày + tốc độ Unlimited (Mbps) + GB/ngày tính giá. Lưu JSON ở `app_settings` key `datapool.unlimited_custom` (`CUSTOM_UNLIMITED_KEY`, `parseCustomUnlimited` trong `lib/datapool-formula.ts`); trùng cặp (dataMB, Mbps) hoặc trùng mức có sẵn 3GB+10Mbps bị bỏ.
- `Assumptions.unlCustom` nạp trong `loadAssumptions`; `unlimitedFactor` tra mức có sẵn trước rồi mức tự thêm. **BC Datapool**: ô tốc độ Unlimited liệt kê thêm các tốc độ tự thêm; file xuất đặt hệ số tự thêm ở ô `T21…` sheet "Tính giá" (công thức trỏ ô đó). **3HK**: policy `X` vẫn chỉ 3GB→10Mbps (chưa mở mức khác — cần mã policy mới nếu Hiếu muốn).

### s233b — QA tab "Tạo sản phẩm" (2026-10-14)

Quét code + chạy thật (DB sống, ~730 tổ hợp builder). Bất biến giữ đúng (độ dài hàng = header, SKU 13 ký tự, product code có trong sheet cùng tenant, tiền tệ đúng tenant, giá > 0, VND nguyên, datapackSku/vendorSku trỏ SKU có thật, không NaN) — test khoá: `datapool-builders-invariants.test.ts`.
- **Lỗi đã sửa**: (1) bảng 3HK `ncc_3hk` ghi `US`, `UK`, `Vatican City` nhưng `NAME_ALIAS` (`lib/bc-datapool/iso.ts`) không nhận → gói đa nước chứa các nước này báo "Không nhận ra nước…" và KHÔNG tra được mã nhóm; nay thêm alias (US/UK/Vatican City/United States of America) → **W22 (42 nước) và W24 (24 nước) tự khớp** mã nhóm. (2) UI cả 2 vendor: `fetch`/`json()` lỗi (mất mạng, 504 trả HTML) làm nút Xem trước/Xuất/Upload KẸT ở trạng thái "đang chạy" và không báo gì → nay có try/catch + thông báo; `runExport(true)` (xác nhận xuất khi còn cảnh báo) dùng `return await` để nút không bật lại giữa lúc đang xuất. (3) Bảng xem trước cắt 1.000 dòng không báo → nay có dòng ghi chú. (4) Công Thức Datapool › Unlimited tự thêm: nhập "0.5 GB" thành 512MB (không khớp "500 MB" ở form BC, và 512MB không mã hoá được) → nay chặn dưới 1GB, bắt nhập theo MB.
- **Phát hiện, CHƯA sửa (cần Hiếu quyết)**: các nhóm có nhiều mã cùng tập nước (AS4/AS5/SEA, AP1/AP2, JAK/JKP) cần chọn tay; vùng 3HK A1/B/C/A2 trong `ncc_3hk` không tương ứng 1 nhóm nước hỗ trợ nào (muốn tạo gói đa nước phải chọn từng nước: dropdown chỉ thêm 1 nước/lần — gợi ý nút "thêm cả vùng"/"theo nhóm"); Australia/New Zealand chưa có Product 3HK để copy khuôn; `GMT+8` (BC) khác `GMT + 8` (3HK), `vendor_expirations` 90 (BC) vs 60 (3HK); 3HK chưa dùng được Unlimited tự thêm; tên SKU gói đa vùng nối hết nước.

### s233c — Hiếu chốt sau QA: cảnh báo nhóm trùng tập nước · thêm cả nhóm/vùng · ANZ · Unlimited tự thêm cho 3HK (2026-10-14)

- **Cảnh báo nhóm nước hỗ trợ CÙNG tập nước** (AS4/AS5/SEA, AP1/AP2, JAK/JKP…): `sameSetGroups()` + `sameSetWarning()` (`lib/bc-datapool/iso.ts`), áp ở route build của CẢ 2 vendor. Chưa có mã → báo "chưa chọn mã" (kèm cảnh báo cũ "mã phải đúng 3 ký tự" nên vẫn CHẶN xuất); đã có mã (tự khớp hoặc nhập tay) → báo "đang dùng X, kiểm tra đúng mã" (KHÔNG chặn — câu chữ cố ý không có chữ "trùng"). Nước đơn nhiều mã cùng tên (Japan JPN/JKD) không báo (mã alpha-3 chuẩn tự chọn).
- **Thêm cả nhóm / vùng (3HK)**: dưới ô "Thêm nước" có ô "+ Thêm cả nhóm / vùng…": (a) **nhóm nước hỗ trợ** mà MỌI nước đều có trong `ncc_3hk` (`coveredGroups()` trong `lib/threehk-datapool/resolve.ts`, trả ở GET `/api/admin/threehk-datapool` → `groups`; hiện 16 nhóm: W22 42 nước, W24 24, EAS, ASI, AP1/AP2, AS4/AS5…), (b) **vùng giá 3HK** (cột `zone`: A1, A2, B, C, D). Chọn xong cộng thêm các nước vào danh sách (không xoá nước đã chọn), mã nhóm vẫn tự tra (khớp đúng tập nước). Đã kiểm sống: W22 và W24 tự ra đúng mã + có khuôn Product.
- **ANZ (Australia + New Zealand)**: hệ thống có 20 Product 3HK mã `ANZ` (F/P/T/X × A/C/E), KHÔNG có `AUS`/`NZL` riêng. Chọn **cả hai nước** → ra mã ANZ, copy được khuôn, SKU đã có bị bỏ đúng. Chọn **chỉ một nước** → mã `AUS`/`NZL` chưa có Product → nay cảnh báo rõ "3HK đang bán nước này trong nhóm ANZ (…) — nếu gói bán gộp hãy chọn đủ các nước của nhóm" (tra các nhóm đủ nước có Product 3HK).
- **Unlimited tự thêm cho 3HK — nguyên nhân trước đó không dùng được**: builder 3HK cứng "Unlimited chỉ 3GB → 10Mbps": chặn mọi dung lượng khác, tên "Unlimited 10mbps", throttle "3GB…10Mbps", `dataMB` 3072 / `speedMbps` 10, form khoá 3GB/GB và không có ô tốc độ. Nay `ThkPlanInput.speedMbps`; dùng `unlimitedFactor()` như BC (mức có sẵn 3GB+10Mbps hoặc mức tự thêm ở Công Thức Datapool; mức chưa khai báo → cảnh báo "chưa có hệ số GB/ngày…" chặn xuất, không đoán); tên/throttle/dataMB/speedMbps theo mức; vẫn dùng **mã `X`** (SKU phân biệt bằng dung lượng tốc độ cao: 1GB → `001`, 500MB → `5HM`; hai mức cùng dung lượng khác tốc độ sẽ trùng SKU — cảnh báo "trùng SKU"). Form: ô "Mức Unlimited" liệt kê mức có sẵn + mức tự thêm (kèm GB/ngày). File xuất: hệ số tự thêm ở `R11…` sheet "Tính giá", cột "Loại gói" ghi tốc độ. Test: `threehk-datapool.test.ts` (4 test mới).


### s233d (2026-10-14) — bảng mức Unlimited, so giá vốn lúc tạo, ô sửa tay, tab "Soát giá vốn"
- **Bảng "Các mức Unlimited"** (Admin › Cài đặt › Công Thức Datapool): key `datapool.unlimited_levels` (JSON `[{dataMb, speedMbps, gbPerDay}]`); 3HK/BC/chatbot dùng chung (`levelsOf` trong `lib/datapool-formula.ts`); key cũ vẫn được ghi song song.
- **BC eSIM full**: tích "đầu US" / "đầu VN" + tích tạo thêm gói data rời (A). SIM full US của BC CHƯA định nghĩa → chưa làm.
- **So giá vốn lúc tạo**: SKU đã có trong hệ thống so `latestCogs` hiện tại với giá tính lại, cảnh báo lệch; ô trong bảng xem trước nhấp đúp để sửa tay → sheet "Chỉnh sửa tay" trong file xuất (`lib/datapool-audit/edits.ts`).
- **Tab Admin "Soát giá vốn"** (`cogs-audit-tab.tsx`, API `/api/admin/datapool-audit`, lõi `lib/datapool-audit/{engine,server,export,compare}.ts`): tính lại giá vốn MỌI SKU 3HK (`3D`), BC CMHK (`WD`), BC Singtel (`W1`) bằng đúng công thức builder (test khoá engine == builder), so `latestCogs`; dung sai 2 cent / 600 VND = "làm tròn". Xem trước + lọc + xuất Excel (sheet Tham số, Soát giá vốn có công thức ROUNDUP, Cập nhật latestCogs).
- **Cảnh báo**: cron `GET /api/cron/datapool-audit` (Bearer CRON_SECRET, `?force=1`) + hook khi lưu `datapool.*` (settings), tỷ giá (fx), bảng giá pool (price-list) → `triggerAudit`. DM Lark cho Hiếu khi chữ ký lệch đổi (không lặp), 1 tin "khớp hết" sau khi từng báo. Trạng thái lưu `app_settings` key `datapool.audit_state`.
- **Còn**: Hiếu thêm job cron-job.org hằng đêm cho `/api/cron/datapool-audit` (production, sau khi merge); chốt định dạng import cho sheet "Cập nhật latestCogs".
- **Làm tròn MỘT lần (2026-10-14, Hiếu chốt):** bỏ ROUNDUP trung gian ở tiền pool (HKD). Data = `ROUNDUP(giá/GB × GB × hệ số [÷ HKD/USD], 2)` (USD), VND = `ROUNDUP(USD × JSC, 0)`. Áp chung `dataCostPool`/`dataCostUsd` → 3HK, BC, Soát giá vốn, file xuất, chuỗi giải thích. Lý do: giá lưu trong hệ thống khớp cách làm tròn 1 lần (vd `3ACHN3DP5HM01` 2.877 VND; cách cũ ra 3.139).
- **BC SIM full (E, chỉ VN) — công thức theo hệ thống (2026-10-14, Hiếu chốt "hệ thống đúng"):** VND = `ROUNDUP(data USD × JSC, 0) + giá SIM trắng (VND, từ DB)`; KHÔNG qua tỷ giá Inc, KHÔNG cộng IMSI (giống 3HK). `frameFeeUsd` chỉ còn eSIM; file xuất bỏ T17/T18, ô Q của SIM full = `ROUNDUP(P*$T$4,0)+$T$8`. Soát giá vốn cùng công thức. Phát hiện khi đối chiếu BC: Daily đang lưu theo 38% (hiện 35%), Unlimited theo 1,7 GB/ngày (hiện 2,0), eSIM Fixed VN theo JSC ~26.266 — là lệch do đổi giả định/tỷ giá, không phải bug.

## s234 (2026-10-15) — Soát giá vốn: ngưỡng làm tròn chặt hơn + file xuất sắp xếp
- **Lỗi:** gói nhỏ (Daily 1 ngày) đổi giá thật 2–8% nhưng chênh chỉ ~500–600đ nên lọt ngưỡng "làm tròn" cũ (≤2 cent / ≤600đ) → verdict `rounding` → KHÔNG vào sheet "Cập nhật latestCogs". Đo trên dữ liệu thật: BC CMHK 22/37 và BC Singtel 15/84 gói Daily 1 ngày bị che.
- **Sửa:** `compare.ts` — làm tròn chỉ giải thích được ≤ 1 cent USD (1 bước ROUNDUP 2 chữ số) ≈ ≤ 275 VND; lớn hơn = `diff`. 3HK 5.155 SKU lệch đúng 262đ (ROUND cũ vs ROUNDUP) vẫn là làm tròn.
- **Sắp xếp:** `compareAuditRows` (engine) — vendor → loại (A data rời / C eSIM full / E SIM full) → kiểu gói (Fixed / Daily / Unlimited) → Product (quốc gia) → dung lượng → ngày → tenant. File xuất thêm cột Product + Quốc gia (sheet soát) và Gói / Product / Vendor / Loại (sheet cập nhật), bật lọc ở cả hai sheet. API GET khi vượt 4.000 dòng cắt phần "làm tròn" trước (lệch / chưa có giá luôn lên đầu).
- **Chốt tiếp cùng ngày: ROUNDUP hết.** Bỏ hẳn ngưỡng "chênh làm tròn" — `compareCogs` chỉ còn `match` (đúng tuyệt đối) hoặc `diff`; kiểu `rounding` giữ trong type nhưng không còn được tạo. 5.155 SKU 3HK cũ tính bằng ROUND (lệch ~262đ/1 cent) và các SKU lệch 1 đồng nay vào danh sách LỆCH + sheet "Cập nhật latestCogs" để cập nhật về giá ROUNDUP. Ảnh hưởng thêm: tab "Tạo sản phẩm" (so giá SKU đã có) cũng coi lệch 1 cent là `diff`; chữ ký lệch của DM tự động đổi → DM kế tiếp báo lại 1 lần.

### s235d (2026-10-16) — Soát giá vốn: bảng không còn bị 3HK che SKU BC lệch thật
- **Lỗi:** sau khi bỏ ngưỡng làm tròn, 5.155 SKU 3HK lệch ~262đ (ROUND cũ → ROUNDUP) chiếm trọn trần 4.000 dòng của API → khi chọn "Tất cả vendor" bảng không hiện SKU BC lệch (32 SKU CMHK) lẫn 383 SKU 3HK "không tính lại được" (bảng giá `ncc_3hk` thiếu giá nước LV); chip "làm tròn" luôn 0 vì kiểu đó không còn được tạo.
- **Sửa:** `api/admin/datapool-audit` sắp xếp trước khi cắt: chưa có giá → không tính lại được → lệch (vendor ít SKU lệch trước, trong vendor theo % chênh giảm dần). UI bỏ chip/nút "làm tròn", mặc định hiện cả "Không tính lại được". File xuất không đổi.
- **Còn:** 383 SKU EU 3HK thiếu giá LV trong `ncc_3hk` — cần bổ sung bảng giá 3HK (Latvia chưa có, xem `analytics-3hk-usage.md` §s229).
- **(2026-10-16, tiếp) Phí khung SIM full hiện rõ:** giá tính lại của SIM full (E) VN luôn đã CỘNG phí khung VND (3HK = khung SIM VN `1D0003DK00000`, BC = giá SIM trắng), khớp builder — nhưng file xuất chỉ có cột "Phí khung (USD)" nên phí VND trông như thiếu, và chú giải BC SIM full không nhắc SIM trắng. Nay: file xuất có cột Y "Phí khung SIM full (VND)" (công thức trỏ sheet Tham số; `COGS VN` = `ROUNDUP(Data USD × JSC) + Y`), `calc.feeVnd` có cả 3HK, chú giải ghi "+ khung SIM VN …"/"+ SIM trắng …". Data rời (A) không có phí khung (đúng builder). Test khoá trong `datapool-audit.test.ts`.
- **(2026-10-16, tiếp) Khôi phục ngưỡng làm tròn ≤ 1 cent:** bỏ hẳn ngưỡng (s234) làm 5.155 SKU 3HK giá cũ tính bằng ROUND hiện LỆCH 1 cent (US) / ~262đ = 1 cent × JSC (VN), còn 210 SKU lệch 1đ — hôm trước 3HK báo 0 lệch vì ngưỡng cũ (≤2 cent/≤600đ) che chúng. Nay `compareCogs` trả "rounding" khi chênh ≤ 0,01 USD hoặc ≤ 275 VND (coi như khớp: không vào bảng LỆCH, sheet "Cập nhật latestCogs" và DM Lark; API cũng không trả dòng rounding). Lớn hơn là lệch thật, kể cả gói nhỏ Daily 1 ngày (vài trăm đồng nhưng vài %, vượt 275). Đo trên staging: 3HK 0 lệch (5.155 rounding, 383 không tính lại được); BC CMHK 278 lệch thật, 32 rounding; BC Singtel 0 lệch. Bước làm tròn vẫn ROUNDUP hết khi TÍNH giá mới — ngưỡng chỉ áp khi SO với giá đang lưu.

## s236 (2026-10-19) — QA tab "Tạo sản phẩm" (BC Datapool và 3HK)

Kiểm sống trên staging bằng API build + tự tính lại độc lập (bảng giá, tỷ giá, giả định lưu trong DB): BC CMHK eSIM Japan (Daily, Fixed, Unlimited 3GB+10Mbps), SIM full và datapack (VND = ROUNDUP(data USD × JSC) + giá SIM trắng 17.236), Singtel Thailand (cảnh báo đúng khi Portal không bán gói); 3HK eSIM Austria (Fixed, Daily, Unlimited, cả Datapack A và eSIM full). Mọi dòng giá vốn khớp từng đồng; SKU đã có được bỏ khỏi file và báo kèm so sánh giá hệ thống (khớp / chênh làm tròn). Giả định đang lưu trong DB: Fixed 55%, Daily 35% (không phải 38% như ghi ở trên), Unlimited 2 GB/ngày cho mức 500MB+10Mbps và 3GB+10Mbps, 1,9 cho 500MB+5Mbps. Đã sửa hiển thị "Fixed 55.00000000000001%" ở khối công thức của tab 3HK.

## s236 (2026-10-19) — "Tạo sản phẩm" tách khỏi Admin

Tab "Tạo sản phẩm" (BC Datapool, 3HK) đã chuyển sang trang riêng `/analytics/product-tools` cùng chức năng Tính giá, phân quyền riêng — xem `product-tools.md`. Admin chỉ còn Cài đặt, Soát giá vốn, Khuyến mãi...; `admin?tab=product-builder` tự chuyển hướng sang trang mới. Code UI nằm ở `components/product-tools/` (`create-products.tsx`, `product-builder-3hk.tsx`, `price-calc.tsx`).

## s241 — Tab "BC Datapool" (quản lý dữ liệu nền) + gỡ trang/cron cũ

- Gỡ trang BC Datapool cũ (đọc catalog BC qua API), `/api/bc/*`, `lib/bc-api.ts`, cron `bc-sync`; migration `v81_drop_bc_sync_tables.sql` xoá 5 bảng `bc_*` (chạy SAU merge).
- Trang mới `/analytics/bc-datapool` (nhóm Creator, API `requireAdmin`): import bảng báo giá (`/api/admin/bc-datapool/price-list`) và file Portal "Purchase information" (`/plan-catalog`), xem nội dung (bảng giá theo pool, danh sách gói + lọc), báo cáo thay đổi so với bản trước. Đọc qua `/api/admin/bc-datapool/sources`.
- Dữ liệu lưu `app_settings` (`bcdp.price_list`, `bcdp.plan_catalog`) — tab "Tính giá & Tạo sản phẩm" đọc đúng khoá này; ở đó chỉ còn hiển thị trạng thái + link sang tab BC Datapool, nút upload đã chuyển đi. `DiffBox` dùng chung: `components/bc-datapool/diff-box.tsx`.
