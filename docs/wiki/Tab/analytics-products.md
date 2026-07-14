---
title: "Products BI (Báo Cáo Hiệu Suất Sản Phẩm)"
page_type: tab_guide
department: all
tags: [tab, analytics, products]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# Products BI (Báo Cáo Hiệu Suất Sản Phẩm)

Báo cáo chuyên sâu theo sản phẩm/SKU: sản lượng bán, doanh thu, cơ cấu giá vốn (COGS), margin và phân tích theo điểm đến (destination).

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: biết SKU/sản phẩm nào bán chạy, lời nhiều/ít, nước nào tiêu thụ mạnh → quyết định nhập hàng, giá, khuyến mãi.
- **Tại sao tách khỏi SP Hệ Thống**: trang SP Hệ Thống là catalog (thông tin SP); Products BI là **số liệu kinh doanh** của SP (bán/doanh thu/lợi nhuận).

## 2. Đường dẫn & file
- **Web**: `/analytics/products` — `web/src/app/(dashboard)/analytics/products/page.tsx`
- **API**: `/api/analytics/products/report`

## 3. Nguồn dữ liệu & nghiệp vụ
- **Sản lượng/doanh thu**: `gohub_dw` fact revenue nhóm theo SKU/product.
- **COGS**: giá vốn (cohort `latest_cogs`) → tính COGS share & margin.
- **Destination (điểm đến)**: trích mã nước từ SKU. **QUAN TRỌNG**: vị trí mã nước trong SKU khác nhau theo họ SKU:
  - digit-prefix (vd `2CTHACBF05010`) → ký tự **3-5** (THA)
  - E-prefix (vd `EJPNBCPY500M30D`) → ký tự **2-4** (JPN)
  - 3-letter (vd `CHN3D07GBFY05D`) → ký tự **1-3** (CHN)
  - Sau khi cắt mã → map tên nước qua **Turso `country_codes`** (KHÔNG dùng `dim_location` = tên chi nhánh).

## 4. Các chỉ số
- **Sales Volume**: số SIM/eSIM bán thành công trong kỳ.
- **Net Revenue**: doanh thu sau khuyến mãi/giảm giá.
- **COGS Share / Margin**: tỷ trọng giá vốn & biên lợi nhuận từng SKU → tìm SP lời nhất / lỗ.

## 5. Vấn đề đã gặp & cách khắc phục
- **Destination sai nước (S79)**: cắt offset cố định → sai với các họ SKU khác nhau. Fix: cắt theo họ SKU (`getDestinationSQL`) + map qua Turso (`getCountryMappings`). Lan sang Dashboard/B2B/B2C breakdown.
- **Cold-load chậm (S81)**: trang fan-out ~14 query. Fix: endpoint qua cache 12h (`/api/analytics/query` đã bọc `cachedAnalyticsQuery`) + prewarm.

## 6. Phân quyền
- Xem: **Admin, Creator, Manager, BOD, Staff**.
- Trang dùng endpoint generic `/api/analytics/query` → allow-list phải có đủ role (creator/manager từng bị bỏ quên → tab rỗng âm thầm, đã fix S80).
