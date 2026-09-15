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
- **Loại sản phẩm (Category)** — 4 nhóm, quyết định bởi 2 field THẬT, không tự đặt taxonomy:
  - **ProductType** = ký tự thứ 2 của mã SKU 13 ký tự (xem `docs/wiki/business/ma-sku.md` mục "Ký tự 2"):
    `C` = eSIM full, `E` = SIM full — 2 loại CHÍNH bán ra thị trường. SKU legacy 14/15 ký tự (không có
    prefix pháp nhân/loại SP) → decode `null` → rơi vào nhóm "Khác".
  - **Có gọi/nhắn tin nội địa** = Supabase `products.local_phone_number === "Yes"` (field thật).
  - 4 nhóm: `esim_data` (eSIM chỉ Data), `esim_local` (eSIM có số nội địa), `sim_data` (SIM vật lý chỉ
    Data), `sim_local` (SIM vật lý nội địa/gọi được), `other` (không decode được ProductType).
  - Đặc điểm hiển thị mỗi category: Gọi/Nhắn tin được, cần KYC (`kyc_needed`, lấy theo ĐA SỐ sản phẩm
    trong nhóm — tránh 1 SKU lệch làm sai chip), Hotspot, Network type — toàn bộ từ Supabase `products`.
- **Nhà mạng (Operator, đợt 5)** = gom theo `products.onsite_carrier` (nhà mạng THẬT phục vụ điểm đến,
  fallback `operator_code` rồi "Chưa rõ nhà mạng") — KHÔNG gom theo vendor GoHub (1 vendor như WorldMove
  route qua nhiều carrier khác nhau tuỳ nước, gom theo vendor sẽ trộn lẫn carrier khác hẳn nhau). Mỗi
  carrier: `networkTypes`, `throttleSummary` (distinct, xem field Loại data bên dưới), `perksList`/
  `restrictionsList` (nội dung THẬT distinct từ `telco_perks`/`unsupported_apps`), `qrPolicies` (từ
  `OPERATOR_POLICY` theo `operator_code` thật thuộc carrier đó). **Tag so sánh** (chỉ tính khi category có
  ≥2 carrier, dựa số liệu thật không tự nhận định): 🚀 tốc độ cao nhất nhóm (`throttleRank()` — noThrottle
  > mbps cao hơn), 📶 nhiều lựa chọn nhất (số SKU nhiều nhất), 🎁 có ưu đãi riêng.
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
  - FE mặc định hiện dạng **chip gọn** ("5GB · 7 ngày"), bấm 1 chip mới xổ card chi tiết đầy đủ (throttle/
    APN/reset/perks) — tránh liệt kê hết ngay gây rối mắt khi 1 carrier có nhiều combo.
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

- Destination code hiển thị dạng 3 ký tự thô (VD "EU1", "AS4") nếu không có trong `country_codes` Turso
  — đây là các gói ĐA QUỐC GIA (Europe pool, Asia pool), không phải lỗi thiếu mapping.
- Nếu Supabase `products` không có entry khớp prefix cho SKU đại diện (SKU cũ/đã ngừng bán) → dòng SP
  vẫn hiện đủ số liệu doanh thu, chỉ thiếu chip network/hotspot/KYC (graceful, không lỗi).
- Nếu `onsite_carrier` VÀ `operator_code` đều NULL cho toàn bộ SKU 1 category → carrier group duy nhất
  tên "Chưa rõ nhà mạng" (graceful, không lỗi, nhưng không có gì để hiện throttle/QR policy).
- CHƯA làm: bảng so sánh side-by-side nhiều destination, date-range picker — xem plan gốc nếu cần bối
  cảnh quyết định (`purring-singing-pancake.md`).

---

## Data Sources

| Column / Metric | Source | Ghi chú |
|---|---|---|
| Revenue/Units/Margin theo destination×vendor×type_of_sim | `fact_fulfillment_revenue` JOIN `dim_sku` | Loại ship fee + đơn nội bộ (`shipFilter`/`internalOpsFilter`) |
| Destination code | SKU (`getDestinationSQL`) | Không dùng `dim_sku.category_name` |
| Tên nước | Turso `country_codes` | `getCountryMappings()` |
| Network/Hotspot/KYC/APN/Data Type/Telco Perks/Unsupported Apps | Supabase `products` | Prefix-match `product_code` với `sku` |
| Nhà mạng (gom nhóm) | Supabase `products.onsite_carrier` | Fallback `operator_code` rồi "Chưa rõ nhà mạng" — đợt 5 |
| Throttle (tốc độ sau quota) | Supabase `products.data_policy_code` | Map `DATA_POLICY` trong `route.ts`, đồng bộ `agents.ts` DATA_DICT — đợt 5 |
| Chính sách QR/đổi máy | `OPERATOR_POLICY` (hardcode, `route.ts`) | Trích tay từ ảnh Hiếu cung cấp, key theo `operator_code`, scope theo carrier đang chọn từ đợt 5 |
