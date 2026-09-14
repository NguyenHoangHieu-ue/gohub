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

---

## 1. Đường dẫn & File
| | |
|---|---|
| Trang | `/analytics/catalogue` — `web/src/app/(dashboard)/analytics/catalogue/page.tsx` |
| API | `GET /api/analytics/product-catalogue` (1 query tổng hợp duy nhất, không loop theo destination/dòng SP — đúng rule N+1) |
| Nguồn | `fact_fulfillment_revenue` + `dim_sku` (gohub_dw) + Supabase `products` (metadata mô tả) + Turso `country_codes` (tên nước) |
| Nav | Sidebar "Analytics & Planning" → **Product Catalogue**; id phân quyền = `catalogue` |

## 2. Khái niệm — kiến trúc 3 tầng

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
- **Sản phẩm cụ thể** = từng SKU thật đã bán (top 6 theo revenue/category), decode từ chính mã SKU theo
  `docs/wiki/business/ma-sku.md`:
  - **Vendor** (ký tự 6-7) + **Dung lượng** (ký tự 9-11, 4 dạng mã hoá: `NNN`=N GB, `NHM`=N×100MB,
    `NDN`=N.NGB, `UNL`=Không giới hạn) + **Số ngày** (ký tự 12-13).
  - **Nhóm Data Policy** (ký tự 8) — CHỈ dùng 2 nhóm **Unlimited** `{A,B,C,D,H}` / **Fixed** `{E,F,G,P,Y,Z}`
    / **Special** `{K}`, KHÔNG hiện chi tiết mbps: 2 file wiki nguồn (`ma-sku.md` mục "Ký tự 8" và
    `loai-data-policy.md`) **GHI NGƯỢC NHAU** ở A/B (1 file nói A=5mbps B=10mbps, file kia nói ngược lại)
    — chưa đối chiếu được với DB thật nên an toàn hơn khi chỉ nói nhóm, không bịa số mbps cụ thể. Nếu
    sau này đối chiếu được, có thể nâng cấp hiển thị chi tiết hơn.
- **Badge** tính trong JS từ số liệu 90 ngày gần nhất, ở CẢ 2 tầng (category trong destination, sản phẩm
  trong category) — không so toàn hệ thống:
  - ⭐ **Bán chạy nhất**: revenue cao nhất trong đúng nhóm đang so (category hoặc sản phẩm).
  - 📈 **Tăng trưởng mạnh**: growth% (so 90 ngày trước đó) ≥ 15%.
  - 💰 **Giá tốt nhất** (chỉ ở tầng sản phẩm): revenue/unit thấp nhất trong nhóm có ≥10 units.

## 3. Phạm vi v1

- Top 8 destination theo doanh thu 90 ngày gần nhất (tính trong JS từ 1 query, không query riêng để
  tìm top-N).
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
- v1 CHƯA làm: bảng so sánh side-by-side nhiều destination, date-range picker, mở rộng ngoài top 8 nước —
  xem plan gốc nếu cần bối cảnh quyết định (`purring-singing-pancake.md`).

---

## Data Sources

| Column / Metric | Source | Ghi chú |
|---|---|---|
| Revenue/Units/Margin theo destination×vendor×type_of_sim | `fact_fulfillment_revenue` JOIN `dim_sku` | Loại ship fee + đơn nội bộ (`shipFilter`/`internalOpsFilter`) |
| Destination code | SKU (`getDestinationSQL`) | Không dùng `dim_sku.category_name` |
| Tên nước | Turso `country_codes` | `getCountryMappings()` |
| Network/Hotspot/KYC | Supabase `products` | Prefix-match `product_code` với `sku` |
