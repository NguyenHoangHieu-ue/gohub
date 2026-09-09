---
title: "System SKUs (Danh Mục Sản Phẩm Hệ Thống)"
page_type: tab_guide
is_hidden: true
department: product
tags: [tab, product, sku]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# System SKUs (Danh Mục Sản Phẩm Hệ Thống)

Catalog sản phẩm cốt lõi GoHub — **nguồn sự thật** cho mọi tab khác (Products BI, chatbot, NCC gap). 4 tầng: **Product → SKU → Listing → Item**.

> Vì sao 4 tầng: tách "gói thương mại" (Product) khỏi "mã kho bán" (SKU), "đăng bán trên sàn" (Listing) và "mã sim vật lý từ NCC" (Item) → 1 gói bán nhiều kênh/nguồn sim mà không trộn dữ liệu.

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/skus` — `web/src/app/(dashboard)/skus/page.tsx` |
| API | `/api/skus` (+`/filters`), `/api/products` (+`/filters`), `/api/listings` (+`/filters`), `/api/items` (+`/filters`) |
| Nguồn | **Supabase**: `products`, `skus`, `listings`, `items`, `ref_countries` |
| Sync | GitHub Actions `sync.yml` — GoHub Core API → Supabase, hàng ngày 01:00 UTC |

## 2. Cấu trúc 4 tầng
```
[Product]  gói thương mại (tên gói, số ngày, khu vực)
   └─► [SKU]      mã kho bán (data/ngày, SIM|eSIM, throttle, latest_cogs, currency)
          └─► [Listing]  đăng bán trên sàn/website (network_operator, telco_perks, giá kênh)
                 └─► [Item]  mã sim/eSIM vật lý + APN từ NCC (19 trường chuyên sâu)
```

### Bảng chính (cột hay dùng)
- **`products`**: `product_code`, tên, số ngày, khu vực.
- **`skus`**: `sku_code`, `product_code`, `data_amount`/`data_amount_unit`, `sim_esim`, `throttle_speed`, `latest_cogs`/`latest_cogs_currency`, `final_cogs_*`, `call`, `expirations`.
- **`listings`**: `listing_code`, `status`, `listing_type`, + **cột JSONB `metadata`** (40 keys/row — xem 3).
- **`items`**: mã sim/eSIM + APN, `type_of_sim`, `item_name_vn`.

## 3. ⭐ Listings dùng cột JSONB `metadata` (s89 Phase 2)
- Listings có **cột phẳng CŨ + cột `metadata` (JSONB)**. Mọi ĐỌC listings đã chuyển sang `metadata` (backfill 40 keys/row cho 16.048 listings).
- `tools.ts` `pickListing()`: core từ cột phẳng + field `_vn`/telco từ metadata (giữ shape gọn, không phình context chatbot).
- Search theo network_operator = JSON path: `metadata->>network_operator ILIKE '%...%'`.
- Promotions đọc `telco_perks` từ `metadata->>telco_perks_en`.
- **Phase 3 (chưa làm)**: sync.py ngừng ghi cột phẳng + DROP cột cũ (migration v22); rồi lặp cho products/skus.

## 4. Tính năng
- Phân trang (`pager.tsx`), rút gọn tên dài (`item_name_vn > 40`, SKU note `> 60`).
- Nút "Chi tiết" ItemsTable → modal 19 trường NCC.
- Export XLSX (Products/SKUs/Items).
- Tra COGS/FX: SKU có `latest_cogs` + `latest_cogs_currency`; quy đổi qua FX (`app_settings` key `fx.*`, xem [[chatbot]] tool get_sku_cogs).

## 5. Phân quyền
- Hiện theo `allowed_tabs` chứa `skus`.
- Standard/Staff: đọc. Manager/Admin/Creator: CRUD.

## 6. Gotchas
- Vendor 3HK trong `dim_sku` (analytics) khác `skus` (product) — đây là product catalog Supabase.
- Đừng đọc cột phẳng listings mới → dùng `metadata` (cột phẳng sẽ bị drop ở Phase 3).
