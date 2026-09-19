---
title: "Product Catalogue (Danh mục sản phẩm — tra theo nước)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, product, catalogue, country, vendor, carrier]
created: 2026-09-14
updated: 2026-09-19
status: active
---

# Product Catalogue — dựng lại s201 (2026-09-19)

> Bản cũ (s198, 9 đợt: gom theo destination giải mã từ mã SKU + doanh thu 90 ngày + tên vùng do AI đặt +
> 4 tầng lồng nhau) **đã bị đập bỏ hoàn toàn** theo yêu cầu Hiếu — sai hướng: người không rành kỹ thuật không
> tìm được "nước X có gì". Bản mới đi theo cách người dùng nghĩ: **chọn nước → gói xếp theo nhà cung cấp →
> bấm gói xem chi tiết**. Không doanh thu, không AI, không gohub_dw.

## 1. Đường dẫn & file

| Thành phần | File |
|---|---|
| Trang | `web/src/app/(dashboard)/analytics/catalogue/page.tsx` (id quyền `catalogue`, giữ nguyên) |
| API chỉ mục | `web/src/app/api/analytics/product-catalogue/route.ts` — `cachedQuery` 30', deps `["catalogue"]`, `?nocache=1` |
| API chi tiết 1 gói | `.../product-catalogue/[code]/route.ts` — 3 truy vấn theo khoá chính, không cache, header `private, no-store` |
| Truy vấn Supabase | `web/src/lib/catalogue/server.ts` (`buildCatalogueIndex`, `fetchAllRows`, `aggregateSkus`, `COGS_ROLES`) |
| Thư viện thuần (có test) | `web/src/lib/catalogue/{plain-language,carriers,country-index,types}.ts` |
| Giao diện | `web/src/components/catalogue/` (`country-home`, `country-page`, `product-card`, `product-drawer`, `vendor-view`, `catalogue-ui`, `use-catalogue`) |
| Test | `web/src/__tests__/catalogue.test.ts` (21 ca) |

## 2. Nguồn dữ liệu (chỉ Supabase)

`products` (~1.000 dòng) · `skus` (~16k, chỉ lấy cột gọn để tổng hợp) · `listings` (chỉ ở phần kỹ thuật) ·
`ref_countries` (tên/châu lục) · `ref_vendors` (tên vendor) · `sync_log` (badge "cập nhật lần cuối").

- **Nước lấy từ `products.supported_countries` (ISO2), KHÔNG suy từ mã SKU** → gói khu vực (vd 22 nước châu Âu)
  tự xuất hiện ở mọi nước nó phủ. Ví dụ Nhật Bản ~128 gói: ~62 gói riêng + ~66 gói dùng chung.
- Supabase project này **cap 1000 dòng/response** → `fetchAllRows` đếm trước rồi tải trang 1000 dòng song song
  (4 trang/lần). Products đã sắp chạm 1000 nên bắt buộc phân trang.
- Tên nước tiếng Việt: `Intl.DisplayNames('vi')` + bảng tên thông dụng (`NAME_VN_OVERRIDE`: Mỹ, Anh, Hồng Kông, Ma Cao).
  Mã ngoài ISO/thiếu trong `ref_countries` (CG, GU, MW, NR, SJ, VI) xử lý mềm.
- **Cờ nước là ảnh (flagcdn.com)** vì Windows không hiển thị emoji cờ (chỉ ra chữ "JP"); lỗi tải → rơi về emoji.
  CSP `img-src https:` đã cho phép.

## 3. Bố cục

1. **Trang chủ**: "Bạn cần sản phẩm cho nước nào?" — ô tìm không dấu (`nhat` → Nhật Bản), nước phổ biến, lưới nước
   theo châu lục ("N gói · M nhà cung cấp"). Tab phụ "Theo nhà cung cấp": vendor → các nước nó phủ → bấm sang trang nước
   (đã lọc theo vendor).
2. **Trang nước** (`?country=JP`, chia sẻ được bằng URL; thêm `&vendor=`, `&p=<mã gói>`): câu tóm tắt tiếng thường,
   **bộ lọc chip bằng TIẾNG ANH** (Hiếu yêu cầu 2026-09-19): Scope (All / Only <nước> / Multi-country) · Type (eSIM / SIM (physical)) · Data (Fixed / Daily / **Unlimited** — Unlimited = gói CÓ lựa chọn dung lượng không giới hạn, kết hợp được với Fixed/Daily) · Other (Phone number / No KYC); nhãn ở `lib/catalogue/filter-labels.ts`. Phần còn lại (thẻ gói, ngăn chi tiết) vẫn tiếng Việt, gói **xếp theo nhà cung cấp**, đầu mỗi nhóm ghi nhà mạng tại nước đó; mỗi nhóm hiện 6 gói đầu + "Xem thêm".
   Trong nhóm: gói riêng cho nước lên trước, càng ít nước càng trên.
3. **Thẻ gói**: eSIM/SIM · Trọn gói/Theo ngày · mạng · pháp nhân (VN/US — phân biệt 2 gói trùng nhau) · nhà mạng ·
   khoảng "300 MB – 50 GB · 1 – 30 ngày (33 lựa chọn)" · **"Khi hết mức data: …"** (phân biệt các gói trông giống nhau) · huy hiệu
   (số điện thoại, WiFi, KYC, dùng ở N nước).
4. **Ngăn chi tiết** (portal ra `document.body` — tránh lỗi transform-containing-block đã gặp ở chuông thông báo):
   Tóm tắt bằng lời → Các gói có sẵn (mỗi dung lượng + các số ngày; bảng từng SKU gập sẵn, có cột **giá vốn chỉ với
   admin/creator/product**) → Cài đặt & cách dùng (kích hoạt, giờ cấp lại data, APN có nút chép, WiFi, nạp thêm, số điện thoại) →
   Lưu ý (KYC + link, ứng dụng không dùng được, ưu đãi nhà mạng, ghi chú tách gạch đầu dòng) → Nước dùng được & nhà mạng →
   Thông tin kỹ thuật (gập sẵn: mã product/vendor/pháp nhân/listing).
5. Banner độ tươi dữ liệu (`sync_log`): ≥3 ngày → hộp cảnh báo vàng "không phải lỗi hiển thị" (xem Gotchas #1).

## 3b. Tự thích ứng khi dữ liệu có giá trị MỚI (s201+1)

Thêm vendor / loại SIM / kiểu data / trạng thái / nước mới vào hệ thống sản phẩm thì Catalogue **không cần sửa code**:

| Giá trị mới | Trang xử lý thế nào |
|---|---|
| Nhà cung cấp mới | Tự có mặt ở tab Theo nhà cung cấp + mọi trang nước nó phủ. Tên: bảng chuẩn trong code → `ref_vendors` → **operator_code phổ biến nhất của các gói vendor đó** (`auto-names.ts` `makeVendorNamer`) → mã thô |
| Loại SIM mới (khác eSIM/SIM) | Hiện nguyên tên gốc, KHÔNG bị nhầm thành "SIM vật lý"; chip lọc tự sinh từ dữ liệu (`distinctSims`); đếm theo từng loại (`simBreakdown`) |
| Kiểu tính dung lượng mới (khác fixed/daily) | Giữ chuỗi gốc của `products.data_type`, chip lọc tự sinh (`distinctDataKinds`) |
| Đơn vị dung lượng lạ (KB/TB) | `toGb` quy đổi; đơn vị lạ coi như GB để vẫn so sánh được |
| Trạng thái mới | Hiện nguyên tên; coi là KHÔNG bán (ẩn mặc định) tới khi khai báo trong `SELLABLE_STATUSES` — banner nhắc admin |
| Mã nước ngoài `ref_countries` | Tên theo `Intl.DisplayNames`, xếp nhóm "Khác" |

`findUnrecognized(index)` liệt kê các giá trị trên; **banner xanh chỉ hiện với admin/creator** (`unrecognized-notice.tsx`)
để biết cần bổ sung tên chuẩn (Admin → Import ref data cho `ref_vendors`, hoặc bảng tên trong `plain-language.ts`).
Trang luôn hiển thị được, banner chỉ là nhắc việc. Test: `catalogue.test.ts` mục "tự thích ứng".

## 3c. Vendor mới tự động (s201+2)

Không còn phải làm tay khi thêm nhà cung cấp mới trong danh sách sản phẩm. Toàn bộ chuỗi:

1. Vendor mới xuất hiện trong hệ thống quản lý sản phẩm → cron sync `core` (hằng ngày) kéo về `products`.
2. `sync.py` `sync_new_vendors()` so `vendor_code` trong `products` với `ref_vendors`: **vendor chưa có thì tự chèn**
   (tên tạm = operator_code phổ biến nhất, VD `VT` → "Viettech"; không ghi đè dòng đã có nên tên do người sửa vẫn giữ)
   và tạo 1 thông báo (chuông + Lark, `visibility=all`) "có nhà cung cấp mới: …".
3. `flush_catalogue_cache()` xoá cache `catalogue:%` trong `analytics_query_cache` → Catalogue hiện vendor mới ngay,
   không chờ hết TTL 30' (chỉ còn cache bộ nhớ 5').
4. Catalogue tự có vendor ở tab Theo nhà cung cấp + mọi trang nước nó phủ (mục 3b). Nếu tên tạm chưa đẹp, admin sửa ở
   Admin → Import ref data (bảng `ref_vendors`) hoặc thêm vào `VENDOR_NAMES` (`plain-language.ts`); banner admin
   nhắc các vendor còn tên tạm.

Lỗi ở bước tự thêm vendor / xoá cache chỉ ghi `[WARN]`, không làm hỏng sync đã ghi xong dữ liệu chính.

## 3d. Gói Inactive / Preparing không lên Catalogue (s201+3, s201+5)

Theo yêu cầu Hiếu: sản phẩm **Inactive** (và Deleted) rồi cả **Preparing** (sắp có) không đưa lên Catalogue. Loại ngay từ server
(`buildCatalogueIndex` lọc `HIDDEN_STATUSES` trong `plain-language.ts`) nên mọi bộ đếm, tab Theo nhà cung cấp, số nước… tự đúng; route chi tiết
trả 404 cho gói bị ẩn và bỏ SKU thuộc các trạng thái đó (giao diện báo "không còn trong danh mục"). Chỉ còn hiện **Active** và **Temporary**
(`SELLABLE_STATUSES`). Đã bỏ công tắc "Include upcoming". Trạng thái LẠ chưa khai báo cũng bị ẩn — banner admin nhắc khai báo vào `SELLABLE_STATUSES` hoặc `HIDDEN_STATUSES`.

## 4. Phân quyền

Route dùng `analyticsGuard` (đăng nhập); route chi tiết chỉ check session (không `analyticsGuard` để khỏi đăng ký
~1k URL vào danh sách prewarm cron). Giá vốn (`latest_cogs`) chỉ trả khi `session.user.role ∈ {admin, creator, product}`.
Tab hiển thị theo ma trận role như cũ (`bod`/`b2b`/`b2c`/`saleb2c`/`product` + admin/creator).

## 5. Gotchas

1. **Dữ liệu cũ do đồng bộ, không phải bug web**: Supabase products/skus/listings đóng băng ở 2026-07-20 tới khi sửa
   cron sync (s201, xem `kien-truc-he-thong.md` mục Sync). Kiểm tra `sync_log.last_sync`.
2. **`onsite_carrier` của gói nhiều nước là đoạn văn "Nước: Carrier"** (401/973 gói; xuống dòng hoặc dính liền 1 dòng,
   nhà mạng và nhãn nước đều nhiều từ). `carriers.ts` nhận diện nhãn bằng tên nước từ `ref_countries` + bí danh
   (US/USA/UK/HongKong…), cắt theo nhãn kế tiếp. Không tách được → hiện nguyên văn (không mất thông tin). Giá trị `Various`
   → "Nhiều nhà mạng (tuỳ khu vực)". Đo trên dữ liệu thật: ~2.100 cặp gói×nước tách được đúng nước, ~3.850 là 1 nhà mạng chung,
   10 không nhận diện được.
3. **Nhiều gói trông y hệt nhau** (vd 3HK Nhật có A/B/F/P × eSIM/SIM): khác nhau ở tốc độ sau khi hết mức data
   (`skus.throttle_speed`, giá trị thô rất lộn xộn: `128 kbps`, `Stop`, `500 MB high speed then drop to 10 mbps`, tiếng Việt…) và pháp nhân —
   thẻ gói hiện cả hai. `throttleShort`/`throttleSentence` (`plain-language.ts`) diễn giải; không hiểu thì trả nguyên văn.
4. **Dung lượng không giới hạn = `data_amount 9999`** (đơn vị GB). `SkuAggregate.gbMin/gbMax` chỉ tính SKU có giới hạn;
   không giới hạn đi bằng cờ `hasUnlimited`.
5. **Mã vendor ↔ tên — `ref_vendors` do admin sửa là nguồn sự thật** (s201+3): tên trong `ref_vendors` **không phải chữ IN HOA** thì thắng
   mọi thứ (VD `WD` = "BC Datapool (CMHK)", `W1` = "BC Datapool (Singtel)" sau khi BC Datapool tách 2 vendor); ref_vendors chỉ IN HOA
   ("WORLDMOVE", "3HK DATAPOOL") hoặc thiếu → bảng `VENDOR_NAMES` trong `plain-language.ts` cho đẹp. **Bug đã sửa**: trước đây bảng
   trong code thắng ref_vendors nên `WD` luôn hiện "BillionConnect Datapool" dù admin đã đổi. Sửa tên vendor: chỉ cần sửa `ref_vendors`
   (Admin → Import ref data) rồi bấm "Tải lại" trên Catalogue (cache 30'; sync tự xoá cache). ⚠️ `ref_vendors` ghi `GB` = **Gighub**,
   trong khi wiki business `ma-sku.md` ghi GB = WorldMove — chưa đối chiếu; catalogue dùng ref_vendors (bảng sống).
6. Chi tiết gói **không qua `cachedQuery`** (3 truy vấn khoá chính, luôn tươi) để không phình `analytics_query_cache`.
7. Vitest không parse `.tsx` với tsconfig `jsx: preserve` — test chỉ đặt cho `.ts` thuần (`lib/catalogue/*`); giao diện
   kiểm bằng render tĩnh dữ liệu thật + QA staging.

## Data Sources

| Bảng | Dùng cho |
|---|---|
| Supabase `products` | mọi thứ về gói: nước, vendor, nhà mạng, loại, mạng, hotspot, KYC, APN, kích hoạt, lưu ý |
| Supabase `skus` | tổng hợp khoảng dung lượng/ngày/tốc độ; bảng từng SKU + giá vốn ở ngăn chi tiết |
| Supabase `listings` | tên hiển thị theo kênh (phần kỹ thuật) |
| Supabase `ref_countries`, `ref_vendors` | tên nước/châu lục, tên vendor |
| Supabase `sync_log` | badge độ tươi |
