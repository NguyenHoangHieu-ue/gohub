---
title: Tính giá & Tạo sản phẩm (tab riêng)
---

# Tính giá & Tạo sản phẩm — `/analytics/product-tools`

Tách khỏi Admin (s236, 2026-10-19). Hai chức năng, hai quyền riêng:

- **Tính giá** — dành cho sale tự tra giá vốn gói data, không phải chờ Creator. Chỉ hiện tên gói (SIM/eSIM + nước + dung lượng + số ngày) và các cột giá (giá/GB, data USD, phí khung, giá vốn US USD, giá vốn VN VND). KHÔNG có mã SKU/Product, ProductID hay file import.
- **Tạo sản phẩm** — như trước ở Admin: BC Datapool và 3HK Datapool, xem trước, sửa tay ô, xuất file Excel import. Quyền này đã gồm Tính giá.

## Phân quyền

- Creator luôn có cả hai. Người khác: danh sách tên trong `app_settings` — `pricing_users` (tính giá) và `product_create_users` (tạo sản phẩm). Creator cấp/thu ở **Creator Settings** (hai khối "Tính giá & Tạo sản phẩm — quyền TÍNH GIÁ / TẠO SẢN PHẨM"), API `/api/creator/pricing-access` và `/api/creator/product-create-access`.
- Cờ trả về ở `/api/user/me`: `pricing_enabled`, `product_create_enabled`. Menu: Creator thấy trong nhóm Creator; người được cấp thấy ở mục "Personal". Cổng trang ở `analytics/layout.tsx` (id `product-tools`); cổng API ở `lib/creator-access.ts` (`requireProductTools("price" | "create")`).
- Upload bảng báo giá BC và danh mục Portal vẫn chỉ Admin/Creator (`requireAdmin`). Giả định giá vốn gửi từ form tạo sản phẩm chỉ có hiệu lực với Creator (người khác luôn dùng giả định đã lưu).

## Tính giá: cách chạy

`GET /api/product-tools/options` trả danh sách điểm đến gộp từ cả ba nguồn (BC CMHK, BC Singtel, 3HK; nước đơn + gói đa nước), mức Unlimited và tỷ giá — **không trả bảng giá gốc của vendor**. `POST /api/product-tools/price` nhận `{destKey, sim, plans[], includeDataOnly}` và trả các dòng giá của từng nhà cung cấp có bán điểm đến đó. Lõi `lib/product-tools/quote.ts` dùng đúng builder của Tạo sản phẩm (cùng công thức, tỷ giá, giả định) nên số luôn khớp file xuất. Dòng rẻ nhất (theo giá vốn VN) được gắn "Rẻ nhất". BC chỉ hiện nước mà Portal đang bán đúng loại SIM; gói BC không bán thì vẫn tính giá nhưng gắn ghi chú "Portal BC không có gói này".

Giao diện 4 bước: loại SIM → nước (tìm kiếm) → gói và số ngày → giá vốn tự tính (chờ 0,4 giây sau lần chỉnh cuối), có nút "Sao chép bảng" dán vào Excel.

## Test

`__tests__/product-tools-quote.test.ts` (giá khớp công thức độc lập, không lộ mã SKU), `product-tools-access.test.ts` (quyền), `product-tools-guards-static.test.ts` (mọi route đều có cổng quyền đúng mức).
