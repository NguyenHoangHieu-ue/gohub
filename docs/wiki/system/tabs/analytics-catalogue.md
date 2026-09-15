---
title: "Product Catalogue (Thế Mạnh Sản Phẩm Theo Destination)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, product, catalogue, destination]
created: 2026-09-14
updated: 2026-09-14
status: active
---

# Product Catalogue

Trang giới thiệu thế mạnh sản phẩm GoHub theo destination — Hiếu yêu cầu 2026-09-14 để nội bộ (sale/
product) nhìn nhanh "ở nước X có những dòng sản phẩm gì, thế mạnh mỗi dòng là gì" khi trao đổi với đối
tác. **Chỉ Internal, sau đăng nhập** (Hiếu chốt qua AskUserQuestion — không làm bản public/external cho
v1, dù ý tưởng ban đầu có nhắc tới external).

**Đợt 2 (cùng ngày)**: Hiếu yêu cầu sâu hơn — breakdown theo LOẠI sản phẩm (data-only vs có gọi/nhắn
tin nội địa, kèm đặc điểm KYC/hotspot) rồi mới tới sản phẩm cụ thể bên trong mỗi loại. Đổi kiến trúc
từ 2 tầng (destination → dòng vendor×simtype) sang **3 tầng: Destination → Loại sản phẩm → Sản phẩm
cụ thể**, xem mục 2 bên dưới.

**Đợt 3 (cùng ngày)**: Hiếu gửi ảnh bảng chính sách QR/đổi máy theo vendor, yêu cầu soát kỹ thêm field
trong Supabase `products` (APN, operator, throttle, policy...). Đã đọc full 36 cột bảng `products` qua
`api/config/db/table` (Dev Tools, creator-only) — bổ sung `data_type` (Fixed/Daily Data, **field CÓ SẴN
thay thế hẳn** việc tự decode ký tự 8 SKU từng phải né vì 2 wiki nguồn ghi ngược nhau), `daily_reset_time`,
`apn`, `operator_code`, `telco_perks`, `unsupported_apps`, `onsite_carrier`. Phần "chính sách QR/đổi máy"
trong ảnh KHÔNG có bảng riêng trong Supabase — trích thủ công phần thông số thực tế (hạn QR/số lần cài
lại/đổi máy) vào `OPERATOR_POLICY` (route.ts), bỏ phần quy trình xử lý CS nội bộ (refund workflow) vì
không hợp với 1 trang catalogue giới thiệu sản phẩm — xem mục 2b.

**Đợt 4 (cùng ngày)**: Hiếu chốt trang này CHỈ để xem THÔNG TIN/spec sản phẩm, không cần số liệu doanh
thu/sản lượng/tăng trưởng — redesign FE bỏ hẳn hiển thị số $ và % (hero stat đổi từ "Doanh thu/Sản
lượng" sang "Loại sản phẩm/Tổng sản phẩm/Nhà mạng hỗ trợ/Loại phổ biến nhất"; sản phẩm đổi từ hàng
ngang có cột $ sang lưới card spec-sheet, badge Best Seller/Fastest Growing/Best Value giữ lại dạng
emoji góc card — vẫn tín hiệu định tính thật, chỉ không in số ra). **`route.ts` KHÔNG đổi** — badge vẫn
tính từ revenue/units/growth thật ở backend, FE chỉ chọn không render phần đó.

**Đợt 5 (2026-09-15) — redesign kiến trúc thông tin theo yêu cầu Hiếu, nâng lên 4 tầng.** Hiếu phản hồi
hiển thị "hơi chưa rõ nhìn" + 3 yêu cầu cụ thể:
1. **Bỏ giới hạn top-8 destination** — trả về TOÀN BỘ destination có doanh thu 90 ngày (`route.ts` bỏ
   hằng `TOP_DESTINATIONS`/slice). Destination picker đổi từ pill-row (không scale nổi full list) sang
   **sidebar có ô tìm-kiếm** (desktop, sticky, filter theo tên/mã) + `<select>` native trên mobile.
2. **Gom theo NHÀ MẠNG THẬT (`onsite_carrier`) thay vì vendor GoHub** — thêm tầng thứ 4:
   Destination → Loại SP → **Nhà mạng** → Sản phẩm cụ thể. 1 vendor GoHub (VD WorldMove) có thể route
   qua nhiều carrier khác nhau tuỳ destination — group key = `onsite_carrier` (fallback `operator_code`
   rồi "Chưa rõ nhà mạng"). Mỗi category hiện dải tab nhà mạng (`OperatorTab`), tag ưu điểm tính từ
   SO SÁNH SỐ THẬT giữa các carrier cùng category (không tự bịa nhận định):
   - 🚀 **Tốc độ cao nhất nhóm** — `throttleRank()` (noThrottle > mbps cao hơn) max trong category.
   - 📶 **Nhiều lựa chọn nhất** — số SKU nhiều nhất trong category.
   - 🎁 **Có ưu đãi riêng** — có `telco_perks` (hiện cả nội dung thật, không chỉ cờ boolean).
   Tag CHỈ tính khi category có ≥2 nhà mạng (1 carrier thì không có gì để so sánh). Panel chi tiết mỗi
   carrier hiện thêm `perksList`/`restrictionsList` (nội dung THẬT, gộp distinct từ mọi SKU carrier đó,
   không chỉ 1 dòng đại diện) + QR policy (như cũ, nay scope đúng carrier đang chọn thay vì cả category).
3. **Throttle thật** — thêm field `data_policy_code` (Supabase `products`, cột CÓ SẴN, KHÔNG decode ký
   tự 8 SKU) + bảng `DATA_POLICY` map trong `route.ts`, **đồng bộ với `agents.ts` DATA_DICT** (mapping
   production Bé Gấu/BI Analyst đang dùng — giữ 1 sự thật duy nhất, khác hẳn 2 wiki mâu thuẫn `ma-sku.md`/
   `loai-data-policy.md` từng phải né ở đợt 3). Hiện dạng chip "Fixed — không giảm tốc" / "Daily — giảm
   còn 10 Mbps sau quota" ở cả tầng carrier (throttleSummary, distinct) và tầng sản phẩm (throttleLabel).
4. **Gom nhóm ngày/data, chỉ xổ list khi chọn** — sản phẩm trong mỗi carrier hiện mặc định dạng CHIP gọn
   ("5GB · 7 ngày") thay vì card đầy đủ luôn hiện; bấm 1 chip mới xổ card chi tiết (accordion 1-mở-1-lúc
   mỗi carrier, state `expandedCombo` keyed `${category.key}:${operator.key}`).

**Không đổi**: badge sản phẩm (best_seller/fastest_growing/best_value), decode capLabel/days từ SKU,
chính sách QR/đổi máy hardcode `OPERATOR_POLICY`, cache TTL 60'. **Đổi shape response** → bump cache key
`v3`→`v4` (category.operators[] thay category.products[] phẳng).

**Đợt 6 (2026-09-15) — 3 fix/thay đổi theo phản hồi Hiếu sau khi xem đợt 5.**
1. **"Chưa rõ nhà mạng" xuất hiện dù thông tin có sẵn** — Hiếu chỉ đúng: nhóm `onsite_carrier` (đợt 5)
   fallback `operator_code` rồi thẳng nhãn cứng "unknown" khi Supabase `products` thiếu cả 2 field (đúng
   với SKU khối lượng lớn 3HK Datapool — vendor tồn tại thật, chỉ 2 field carrier chưa nhập). Fix: fallback
   thêm 1 bậc nữa về **vendor GoHub** (`a.vendor`, LUÔN có — SQL đã lọc `v.vendor IS NOT NULL`) trước khi
   chịu thua — không còn rơi vào "chưa rõ" khi thông tin vendor đã hiển thị sẵn nơi khác trên trang.
2. **Chỉ 2 category thật: eSIM / SIM vật lý** — Hiếu chốt bỏ hẳn kiến trúc 4-category đợt 2 (data-only vs
   có gọi nội địa × eSIM/SIM). `categoryKey()` giờ CHỈ đọc ProductType (ký tự 2 SKU: `C`→eSIM, `E`→SIM,
   khác→"Khác") — bỏ tham số `hasCall`. "Có SDT nội địa" KHÔNG còn là trục phân loại, chuyển thành:
   - **1 nút toggle nổi bật đầu category** ("📞 Có SDT nội địa (N gói)", field mới
     `category.localNumberProductCount`) — bấm để lọc CHỈ hiện gói có `local_phone_number="Yes"` trong
     mọi nhà mạng của category đó (client-side, không gọi lại API).
   - **Chip thông tin ở panel carrier** (`operator.localNumberCountries`, distinct) — luôn hiện nếu carrier
     đó có gói local number, không cần bật filter mới thấy.
   - **Badge 📱 trên chip dung lượng + dòng chi tiết** (`product.hasLocalNumber`/`localNumberCountry`) khi
     xổ card đầy đủ.
3. **Gói ngày/data drill 2 tầng** — trước gộp "dung lượng · ngày" thành 1 chip phẳng; nay tách:
   bấm chip **NGÀY** trước (`selectedDay` state, keyed `${category.key}:${operator.key}`) → mới hiện dải
   chip **DUNG LƯỢNG** khớp đúng ngày đó → bấm dung lượng mới xổ card chi tiết (như cũ). Giảm số item hiện
   cùng lúc khi 1 carrier có nhiều tổ hợp ngày×dung lượng (VD 3HK Datapool).

Thêm Supabase field `local_number_country` vào select (trước chỉ có `local_phone_number`). Đổi shape →
bump cache key `v4`→`v5`.

**Đợt 7 (2026-09-15) — 2 fix tiếp, verify TRỰC TIẾP Supabase `products` qua REST API (Hiếu đưa key trong
`tmp.txt`, không đoán) sau khi Hiếu báo đợt 6 vẫn "mất thông tin" + chưa có view SDT nội địa xuyên nước.**
1. **Root cause thật của "mất thông tin"**: fallback vendor ở đợt 6 đúng nhưng CHƯA đủ — verify qua
   Supabase thật phát hiện `onsite_carrier` với gói **pool đa quốc gia** (Europe/Asia/Global) lưu nguyên
   **đoạn văn nhiều dòng** dạng "Nước: Carrier" cho MỌI nước phủ sóng (VD
   `"Singapore: Simba\nMalaysia: Celcomdigi, U-mobile\nIndonesia: Telkomsel, Indosat..."`, có case dài cả
   trăm từ liệt kê ~40 nước). Route cũ dùng field này LÀM THẲNG tên tab nhà mạng → tab hiện nguyên cả đoạn
   văn (không phải carrier bị mất, mà hiển thị sai dạng khiến trang rối, đọc như "mất thông tin sạch").
   Fix (`route.ts`, hàm `isCleanCarrierName()`): CHỈ dùng `onsite_carrier` làm tên tab khi ngắn (≤40 ký tự)
   và không xuống dòng (case carrier đơn: "Smart"/"SKT"/"DTAC"/"China Unicom, CTM"...) — còn lại (đoạn văn
   dài) group theo `operator_code` (tên hãng: "WORLDMOVE"/"JOYTEL"/"BILLIONCONNECT") rồi vendor, và đoạn
   văn gốc giữ lại làm `operator.coverageNotes[]` — hiện qua nút "Phạm vi phủ sóng theo nước" xổ ra (không
   mất thông tin, chỉ không dùng làm TÊN TAB).
2. **Bảng tổng hợp TOÀN HỆ THỐNG "Gói có SDT nội địa"** — đúng yêu cầu Hiếu "1 button hiển thị các gói có
   SDT local của các nước - vendor - nhà mạng" (số nhiều "các nước" = xuyên destination). Verify qua
   Supabase: CHỈ ~50 `product_code` Active toàn hệ thống có `local_phone_number="Yes"` (VN/TH/US/FR-pool
   Europe/MN/GB) — đủ nhỏ để build 100% ở FE từ dữ liệu ĐÃ fetch (không thêm API/query nào). Nút mới đầu
   trang "📞 Gói có SDT nội địa (N)" xổ `DataTable` (dùng chung dashboard-kit — có sẵn sort/search/phân
   trang) liệt kê Điểm đến/Loại SP/Vendor GoHub/Nhà mạng/Gói/Nước SDT + nút "Xem →" nhảy thẳng tới đúng
   destination (đóng panel + `setSelected`).

Không đổi shape API (chỉ thêm `operator.coverageNotes` — cache key `v5`→`v6`; bảng tổng hợp hoàn toàn FE,
không cần route mới).

⚠️ **Gotcha bảo mật phát hiện lúc verify**: Hiếu để `D:\gohub\tmp.txt` chứa Supabase secret key + Vercel
token dạng plaintext ở gốc repo (untracked, không commit). Đã dùng để verify rồi dừng — KHÔNG commit file
này. Hiếu nên tự xoá/di chuyển ra khỏi thư mục repo khi xong việc, tránh vô tình `git add -A` dính vào.

**Đợt 8 (2026-09-15) — 4 việc theo yêu cầu Hiếu, hỏi lại 1 điểm mơ hồ trước khi làm (AskUserQuestion) rồi
code toàn bộ phần còn lại.**

0. **Hỏi trước khi làm**: Hiếu yêu cầu "rồi mới tới giá + chi tiết gói" — mâu thuẫn tiềm tàng với quyết
   định đợt 4 (đã chốt bỏ hẳn số $ khỏi trang, đây là trang giới thiệu không phải kế toán) + Supabase
   không có field giá bán lẻ (chỉ có `latest_cogs` = giá vốn nội bộ, dữ liệu nhạy cảm margin). Hỏi lại qua
   AskUserQuestion — Hiếu chọn **"Bỏ qua, không cần giá"** → giữ nguyên quyết định đợt 4, KHÔNG thêm số $
   nào. Phần còn lại của "giá + chi tiết gói" hiểu là chi tiết THÔNG SỐ (đã có: throttle/APN/reset...).

1. **Destination mã thô → AI đặt tên khu vực** (`formatUnmappedDestinations()`, `route.ts`) — với
   destination KHÔNG có trong Turso `country_codes` (gói pool tự đặt mã như EU1/APA/GZ1), lấy
   `supported_countries` THẬT (ISO2, Supabase `products`) của mọi SKU thuộc destination đó, gộp **1 batch
   Gemini call DUY NHẤT** (không loop từng destination — đúng tinh thần rule N+1 dù là AI call chứ không
   phải DB query) yêu cầu đặt tên khu vực tiếng Việt ngắn gọn (VD "Châu Âu", "Châu Á - Thái Bình Dương").
   Model `gemini-3.8-flash` + `thinkingLevel:"minimal"` (đúng convention cost-safety đã áp cho các call
   1-shot khác trong repo). Lỗi/parse fail → fallback về mã thô (graceful, không crash).
2. **Loại bỏ destination "000"** (SIM frame/eSIM profile — ma-sku.md: mã đặc biệt không gắn nước cụ thể,
   không phải sản phẩm bán ra) — thêm `AND ${destExpr} != '000'` ngay trong WHERE của query gohub_dw (lọc
   ở DB, không phải filter JS sau khi đã fetch).
3. **Hoàn thiện + sắp xếp lại thông tin theo đúng thứ tự Hiếu yêu cầu** — panel mỗi nhà mạng giờ theo thứ
   tự: **onsite_carrier** (tab, luôn ở đầu, không đổi) → **Đặc điểm** (network/KYC/Hotspot/Nạp thêm data —
   3 field cuối tính majority riêng theo TỪNG carrier, chính xác hơn category-wide cũ) → **Ưu đãi/hạn chế**
   (perks/restrictions, như cũ) → **Ghi chú/kích hoạt** (field `note`/`activation_time`/`kyc_links` CÓ SẴN
   Supabase nhưng CHƯA TỪNG hiển thị ở trang này trước đợt 8) → **Phủ sóng/QR policy** (ít quan trọng hơn,
   gấp gọn cuối). Bỏ hẳn KYC/Hotspot/Network ở HEADER category (trùng lặp + kém chính xác hơn bản
   per-carrier mới, gây rối — category giờ chỉ còn tên/số lượng/badge/toggle SDT nội địa).
4. **"Gói có SDT nội địa" nâng thành banner riêng** — trước là nút nhỏ cạnh "Tải lại mới" (dễ bị bỏ qua);
   nay là 1 banner đầy đủ ngay dưới header (icon + số lượng + mô tả), đúng lý do Hiếu nêu "khách thường hỏi
   cái này trước". Bấm mở `DataTable` y hệt đợt 7 (không đổi nội dung bảng).
   Kèm dọn nhỏ: bỏ `uppercase tracking-wide` ở 2 label "Chọn số ngày"/"Chọn dung lượng" (đổi sentence-case
   — theo hướng dẫn thiết kế tránh ALL-CAPS cho low-tech dễ đọc hơn).

Thêm Supabase field `supported_countries`/`note`/`activation_time`/`top_up_options`/`kyc_links` vào select.
Đổi shape → bump cache key `v6`→`v7`.

---

## 1. Đường dẫn & File
| | |
|---|---|
| Trang | `/analytics/catalogue` — `web/src/app/(dashboard)/analytics/catalogue/page.tsx` |
| API | `GET /api/analytics/product-catalogue` (1 query tổng hợp duy nhất, không loop theo destination/dòng SP — đúng rule N+1) |
| Nguồn | `fact_fulfillment_revenue` + `dim_sku` (gohub_dw) + Supabase `products` (metadata mô tả) + Turso `country_codes` (tên nước) |
| Nav | Sidebar "Analytics & Planning" → **Product Catalogue**; id phân quyền = `catalogue` |

## 2. Khái niệm — kiến trúc 4 tầng (Destination → Loại SP → Nhà mạng → Sản phẩm)

- **Destination**: giải mã từ mã SKU qua `getDestinationSQL()`/`decodeSkuDestinationCode()`
  (`analytics-helpers.ts`, đã fix đúng theo ĐỘ DÀI sku ở s195+19/s197) — KHÔNG dùng `dim_sku.category_name`
  (phần lớn "Unknown" cho SKU khối lượng lớn 3HK Datapool).
- **Loại sản phẩm (Category)** — CHỈ 2 nhóm thật + 1 fallback (Hiếu chốt lại đợt 6, bỏ hẳn kiến trúc
  4-nhóm của đợt 2):
  - **ProductType** = ký tự thứ 2 của mã SKU 13 ký tự (xem `docs/wiki/business/ma-sku.md` mục "Ký tự 2"):
    `C` → **eSIM**, `E` → **SIM vật lý**. SKU legacy 14/15 ký tự (không có prefix pháp nhân/loại SP) →
    decode `null` → nhóm **"Khác"**.
  - "Có gọi/nhắn tin nội địa" (`products.local_phone_number === "Yes"`) KHÔNG còn quyết định category —
    xem mục "Có SDT nội địa" bên dưới (đợt 6, chuyển thành filter/badge chứ không phải trục phân loại).
  - Đặc điểm hiển thị mỗi category: cần KYC (`kyc_needed`, lấy theo ĐA SỐ sản phẩm trong nhóm — tránh 1
    SKU lệch làm sai chip), Hotspot, Network type — toàn bộ từ Supabase `products`.
- **Nhà mạng (Operator, đợt 5)** = gom theo `products.onsite_carrier` (nhà mạng THẬT phục vụ điểm đến,
  fallback `operator_code` rồi **fallback cuối = vendor GoHub** `a.vendor`, LUÔN có — fix đợt 6, tránh rơi
  vào "chưa rõ nhà mạng" khi Supabase chỉ thiếu 2 field carrier trong khi vendor đã hiển thị sẵn nơi khác)
  — KHÔNG gom theo vendor GoHub làm trục CHÍNH (1 vendor như WorldMove route qua nhiều carrier khác nhau
  tuỳ nước, gom theo vendor sẽ trộn lẫn carrier khác hẳn nhau). Mỗi carrier: `networkTypes`,
  `throttleSummary` (distinct, xem field Loại data bên dưới), `perksList`/`restrictionsList` (nội dung
  THẬT distinct từ `telco_perks`/`unsupported_apps`), `localNumberCountries` (đợt 6, distinct nước có SDT
  nội địa trong carrier này), `qrPolicies` (từ `OPERATOR_POLICY` theo `operator_code` thật thuộc carrier
  đó). **Tag so sánh** (chỉ tính khi category có ≥2 carrier, dựa số liệu thật không tự nhận định): 🚀 tốc
  độ cao nhất nhóm (`throttleRank()` — noThrottle > mbps cao hơn), 📶 nhiều lựa chọn nhất (số SKU nhiều
  nhất), 🎁 có ưu đãi riêng.
- **Có SDT nội địa (đợt 6)** — KHÔNG còn tách category riêng. `category.localNumberProductCount` (tổng số
  gói có `local_phone_number="Yes"` trong category) hiện thành 1 nút toggle nổi bật đầu trang category
  ("📞 Có SDT nội địa (N gói)") — bấm lọc client-side mọi carrier trong category chỉ còn gói có SDT nội
  địa. Không bấm vẫn thấy được carrier nào có SDT nội địa qua chip `localNumberCountries` ở panel carrier.
- **Sản phẩm cụ thể** = từng SKU thật đã bán, gom trong mỗi carrier (KHÔNG còn giới hạn top-6/category từ
  đợt 5 — safety valve `MAX_PRODUCTS_PER_OPERATOR=60`/carrier chống payload phình bất thường, không phải
  giới hạn hiển thị chủ đích):
  - **Vendor GoHub** + **Dung lượng** + **Số ngày**: decode từ chính mã SKU theo `docs/wiki/business/ma-sku.md`
    (ký tự 6-7 = vendor; ký tự 9-11 = dung lượng, 4 dạng mã hoá `NNN`=N GB/`NHM`=N×100MB/`NDN`=N.NGB/
    `UNL`=Không giới hạn; ký tự 12-13 = số ngày).
  - **Loại data** = Supabase `products.data_type` (`"Fixed Data"`/`"Daily Data"`, field thật). Khi
    `data_type = "Daily Data"` → hiện kèm `daily_reset_time`.
  - **Throttle thật (đợt 5)** = Supabase `products.data_policy_code` — field CÓ SẴN, KHÔNG decode ký tự 8
    SKU. Map `DATA_POLICY` trong `route.ts` **đồng bộ với `agents.ts` DATA_DICT** (mapping production Bé
    Gấu/BI Analyst đang dùng để trả lời user — 1 sự thật duy nhất, tránh mâu thuẫn A/B giữa 2 wiki
    `ma-sku.md`/`loai-data-policy.md` mà đợt 2/3 từng phải né).
  - **APN** (`apn`) hiện trên mỗi sản phẩm; **Ưu đãi/Hạn chế** (`telco_perks`/`unsupported_apps`) hiện cả
    ở tầng carrier (gộp distinct) lẫn tầng sản phẩm cụ thể (nếu khác biệt theo SKU).
  - FE drill **2 tầng** (đổi từ 1 chip phẳng "5GB · 7 ngày" ở đợt 5, đợt 6 tách theo yêu cầu Hiếu): bấm
    chip **NGÀY** trước → mới hiện dải chip **DUNG LƯỢNG** khớp đúng ngày đó → bấm dung lượng mới xổ card
    chi tiết đầy đủ (throttle/APN/reset/perks/SDT nội địa). Giảm rối mắt khi 1 carrier có nhiều tổ hợp
    ngày×dung lượng (VD 3HK Datapool).
- **Badge** tính trong JS từ số liệu 90 ngày gần nhất, ở CẢ 2 tầng (category trong destination, sản phẩm
  trong carrier) — không so toàn hệ thống:
  - ⭐ **Bán chạy nhất**: revenue cao nhất trong đúng nhóm đang so (category hoặc sản phẩm).
  - 📈 **Tăng trưởng mạnh**: growth% (so 90 ngày trước đó) ≥ 15%.
  - 💰 **Giá tốt nhất** (chỉ ở tầng sản phẩm): revenue/unit thấp nhất trong nhóm có ≥10 units.

## 2b. Chính sách QR/đổi máy theo Operator (đợt 3, đợt 5 chuyển scope sang carrier đang chọn)

Nút "Chính sách QR/đổi máy" ở panel carrier đang chọn (chỉ hiện khi carrier đó có `operator_code` nào
nằm trong `OPERATOR_POLICY`, `route.ts`) — xổ ra hạn hiệu lực mã QR, số lần cài lại được, số lần đổi
thiết bị. Đợt 3 nút này ở scope cả category (gộp mọi operator); đợt 5 scope đúng carrier đang chọn (rõ
ràng hơn khi category có nhiều carrier, tránh trộn chính sách của carrier khác vào). Nguồn: bảng tham chiếu
Hiếu cung cấp (ảnh 2026-09-14), **KHÔNG có bảng tương ứng trong Supabase** — trích tay, key theo
`operator_code`. Chỉ giữ phần THÔNG SỐ THỰC TẾ (hạn QR/số lần cài lại/đổi máy) cho mục đích giới thiệu;
**cố tình bỏ** phần quy trình xử lý CS nội bộ trong ảnh gốc (VD cách báo lỗi cho từng vendor, quy trình
refund, ghi chú nội bộ như "chưa rõ limit ở đâu") — nội dung đó thuộc CS Troubleshoot runbook, không hợp
với trang catalogue giới thiệu sản phẩm cho sale/đối tác. Nếu Hiếu muốn nội dung này ĐẦY ĐỦ + editable
qua UI (không phải hardcode trong route), cần 1 bảng Supabase riêng — chưa làm, để bàn thêm.

## 3. Phạm vi

- **Toàn bộ destination có doanh thu 90 ngày** (bỏ giới hạn top-8 từ đợt 5) — tính trong JS từ 1 query,
  không query riêng để tìm top-N. Sidebar có ô tìm-kiếm (desktop) / `<select>` native (mobile) để duyệt.
- Cố định cửa sổ 90 ngày (hiện tại) vs 90 ngày trước đó (growth) — CHƯA có date-range picker.
- KHÔNG hiện COGS/margin thô trên UI dù dữ liệu nội bộ — margin chỉ dùng để tính badge nội bộ (giữ tinh
  thần "trình bày thế mạnh", không phải bảng kế toán).
- Cache `cachedQuery` TTL 60 phút (dữ liệu tổng hợp nhiều nguồn, không cần tươi từng phút) — có nút
  "Tải lại mới" trên UI nhưng hiện tại chỉ gọi lại API bình thường (route CHƯA có tham số `nocache`,
  vì snapshot 90-ngày ít khi cần ép tươi ngay — khác BOD/B2B, những tab cần đối chiếu số real-time).

## 4. Phân quyền

Thêm `catalogue` vào `ALL_ANALYTICS_IDS` (`lib/analytics-roles.ts`) + default cho role `bod` (qua
`ALL_ANALYTICS_IDS`), `b2b`, `b2c`, `saleb2c`, `product` (nhóm hay trao đổi sản phẩm với đối tác/khách).
Chưa thêm `ops-&-cs`/`hr`/`staff` — Hiếu tự cấp thêm qua Settings nếu cần, không cần sửa code.

## 5. Gotchas

- Destination không có trong `country_codes` Turso (VD "EU1", "AS4" — gói ĐA QUỐC GIA, không phải lỗi
  thiếu mapping) từ đợt 8 được AI đặt tên khu vực tiếng Việt tự động (xem mục "Đợt 8"). Nếu Gemini lỗi/hết
  quota → fallback về mã thô 3 ký tự như trước, không crash trang.
- Destination `"000"` (SIM frame/eSIM profile) đã bị loại bỏ hoàn toàn khỏi trang từ đợt 8 (lọc ở SQL).
- Nếu Supabase `products` không có entry khớp prefix cho SKU đại diện (SKU cũ/đã ngừng bán) → dòng SP
  vẫn hiện đủ số liệu doanh thu, chỉ thiếu chip network/hotspot/KYC (graceful, không lỗi).
- Nếu `onsite_carrier` VÀ `operator_code` đều NULL → group theo tên **vendor GoHub** (đợt 6, luôn có).
  Chỉ khi vendor cũng rỗng (không thể — SQL đã lọc `v.vendor IS NOT NULL`) mới thật sự không group được.
- CHƯA làm: bảng so sánh side-by-side nhiều destination, date-range picker — xem plan gốc nếu cần bối
  cảnh quyết định (`purring-singing-pancake.md`).

---

## Data Sources

| Column / Metric | Source | Ghi chú |
|---|---|---|
| Revenue/Units/Margin theo destination×vendor×type_of_sim | `fact_fulfillment_revenue` JOIN `dim_sku` | Loại ship fee + đơn nội bộ (`shipFilter`/`internalOpsFilter`) |
| Destination code | SKU (`getDestinationSQL`) | Không dùng `dim_sku.category_name` |
| Tên nước | Turso `country_codes` | `getCountryMappings()` |
| Tên khu vực (destination không có trong country_codes) | Gemini, input = `products.supported_countries` thật | 1 batch call, cache cùng payload — đợt 8, fallback mã thô nếu lỗi |
| Network/Hotspot/KYC/APN/Data Type/Telco Perks/Unsupported Apps/Note/Activation/Top-up/KYC Links | Supabase `products` | Prefix-match `product_code` với `sku`; Note/Activation/Top-up/KYC Links thêm đợt 8 |
| Nhà mạng (gom nhóm) | Supabase `products.onsite_carrier` | Chỉ dùng làm tên tab khi ngắn/sạch (≤40 ký tự, không xuống dòng) — đoạn văn dài (gói pool) → group `operator_code` rồi vendor, giữ lại làm `coverageNotes` (đợt 5/6/7) |
| Throttle (tốc độ sau quota) | Supabase `products.data_policy_code` | Map `DATA_POLICY` trong `route.ts`, đồng bộ `agents.ts` DATA_DICT — đợt 5 |
| Chính sách QR/đổi máy | `OPERATOR_POLICY` (hardcode, `route.ts`) | Trích tay từ ảnh Hiếu cung cấp, key theo `operator_code`, scope theo carrier đang chọn từ đợt 5 |
| KYC/Hotspot/Top-up theo TỪNG nhà mạng | Supabase `products` (majority trong carrier) | Chính xác hơn bản category-wide cũ — đợt 8 |
