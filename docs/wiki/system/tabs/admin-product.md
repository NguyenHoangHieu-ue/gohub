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
- **Giao diện Web**: `/admin` (`web/src/app/(dashboard)/admin/page.tsx`) — gồm các tab: Cài đặt, Tạo template, Khuyến mãi, Lịch Lark.
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
- **Tạo template** SP (WM/3HK, eSIM/SIM): `/api/admin/template`.

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
