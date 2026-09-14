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

---

## 1. Đường dẫn & File
| | |
|---|---|
| Trang | `/analytics/catalogue` — `web/src/app/(dashboard)/analytics/catalogue/page.tsx` |
| API | `GET /api/analytics/product-catalogue` (1 query tổng hợp duy nhất, không loop theo destination/dòng SP — đúng rule N+1) |
| Nguồn | `fact_fulfillment_revenue` + `dim_sku` (gohub_dw) + Supabase `products` (metadata mô tả) + Turso `country_codes` (tên nước) |
| Nav | Sidebar "Analytics & Planning" → **Product Catalogue**; id phân quyền = `catalogue` |

## 2. Khái niệm

- **Destination**: giải mã từ mã SKU qua `getDestinationSQL()`/`decodeSkuDestinationCode()`
  (`analytics-helpers.ts`, đã fix đúng theo ĐỘ DÀI sku ở s195+19/s197) — KHÔNG dùng `dim_sku.category_name`
  (phần lớn "Unknown" cho SKU khối lượng lớn 3HK Datapool).
- **Dòng sản phẩm** = tổ hợp `vendor` × `type_of_sim` (SIM/eSIM) trong `dim_sku` — nhóm dữ liệu THẬT,
  không phải taxonomy tự đặt. `dim_sku.product_type` (eSIM full/SIM full/SIM-eSIM data) là cơ chế
  fulfillment, không phải "dòng sản phẩm" theo nghĩa thương mại nên KHÔNG dùng để nhóm.
- **Metadata mô tả** (network 4G/5G, hỗ trợ hotspot, cần KYC không) lấy từ Supabase `products`
  (`network_type`/`hotspot`/`kyc_needed`), join bằng **prefix match**: `dim_sku.sku` bắt đầu bằng
  `products.product_code` (8 ký tự base code, sku thật có thêm suffix theo gói dung lượng/thời hạn —
  KHÔNG phải exact match).
- **Badge** tính trong JS từ số liệu 90 ngày gần nhất, chỉ so sánh TRONG cùng 1 destination:
  - ⭐ **Bán chạy nhất**: dòng SP có revenue cao nhất trong destination đó.
  - 📈 **Tăng trưởng mạnh**: growth% (so 90 ngày trước đó) ≥ 15% — ngưỡng để tránh badge cho biến động nhỏ.
  - 💰 **Giá tốt nhất**: revenue/unit thấp nhất trong nhóm có ≥10 units (tránh outlier 1-2 đơn).

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
