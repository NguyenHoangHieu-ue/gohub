---
title: "Reference Countries (Danh Mục Quốc Gia Tham Chiếu)"
page_type: tab_guide
is_hidden: true
department: product
tags: [tab, reference, countries]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Reference Countries (Danh Mục Quốc Gia Tham Chiếu)

Quản lý danh mục các quốc gia, vùng lãnh thổ, nhóm địa lý và hỗ trợ ánh xạ ISO Code chuẩn hóa toàn hệ thống.

> **Mục đích & vai trò**: Master Data địa lý — mọi nơi (SKU, gói NCC, đơn hàng, dashboard "Top điểm đến") đều map về đây để hiển thị tên nước thống nhất. **Tại sao cần**: GoHub dùng mã nước custom (RUS, EU1, W04...) không phải ISO chuẩn; phải có bảng tham chiếu để decode mã→tên + nhóm nước hỗ trợ → tránh mỗi nơi hiểu một kiểu.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/countries` (`web/src/app/(dashboard)/countries/page.tsx`)
- **API Backend**: `/api/countries` (`web/src/app/api/countries/route.ts`)

---

## 2. Thiết kế Cơ Sở Dữ Liệu (Supabase)
API `/api/countries` đọc các bảng ref: **`ref_countries`, `ref_support_countries`, `ref_categories`, `ref_vendors`**.
- **`ref_countries`**: quốc gia, mã ISO2/ISO3, tên EN/VI, mã vùng điện thoại.
- **`ref_support_countries`**: các nước GoHub có hạ tầng SIM du lịch.
- **`ref_categories`** / **`ref_vendors`**: danh mục nhóm SP / NCC (đồng bộ từ Data xlsx qua `data_sync.yml`).

> ⚠️ **KHÁC với `country_codes` bên analytics**: map SKU→nước đích ở BI dùng bảng **`country_codes` trên Turso** (332 dòng) — KHÔNG phải `ref_countries` Supabase ở đây. Xem [[_analytics-data-model]] §3.

---

## 3. Quy Trình Vận Hành
- **Chuẩn hóa địa lý**: Là cơ sở dữ liệu nền (Master Data) để toàn bộ hệ thống tham chiếu. Mọi thực thể như SKU, Gói cước của NCC hay Đơn hàng từ kho dữ liệu đều ánh xạ về bảng quốc gia này để chuẩn hóa hiển thị.
- **Tìm kiếm & Phân nhóm**: Hỗ trợ tìm kiếm quốc gia theo tên, mã ISO hoặc phân loại theo châu lục (Asia, Europe, America, Africa, Oceania).

---

## UI (s193, 2026-09-05)
Cả 4 sub-tab (Mã Nước/Nhóm Nước Hỗ Trợ/Category/Mã Vendor) đổi bảng `<table>` tay sang `DataTable`
(`dashboard-kit.tsx`) — có phân trang sẵn (trước hiện hết toàn bộ danh sách, "Mã Nước" 271 dòng không phân
trang). Badge "Đa quốc gia" đổi hex lạc `blue-100/blue-700` sang `brand-100/brand-700` khớp token đã dùng
mọi nơi khác trong trang. Không đổi logic search/filter.

## 4. Phân Quyền
- **Standard / Staff / BOD**: Được truy cập để xem và tra cứu danh mục phục vụ công tác bán hàng hoặc đối chiếu vận hành.
- **Manager / Admin / Creator**: Có quyền cập nhật thông tin quốc gia, chỉnh sửa tên hiển thị hoặc thêm nhóm địa lý mới khi có điều chỉnh.\n