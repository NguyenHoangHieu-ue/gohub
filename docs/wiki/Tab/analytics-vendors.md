---
title: "Vendor Performance (Hiệu Suất Nhà Cung Cấp)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, vendors]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Vendor Performance (Hiệu Suất Nhà Cung Cấp)

Doanh thu / margin / units / orders theo **vendor (NCC)** — WorldMove, 3HK DATAPOOL, v.v. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/vendors` — `web/src/app/(dashboard)/analytics/vendors/page.tsx` |
| API | `/api/analytics/vendors/report`, `/api/analytics/vendors/list` |
| Nguồn | fact (Fulfillment/Sales) + `dim_sku` (cột `vendor`) + `dim_order_source` |

## 2. Logic
- Gom doanh thu theo `dim_sku.vendor` (join `f.sku = dim_sku.sku`).
- Trả: `sku` / vendor, `revenue`, `margin`, `units`, `orders` (`COUNT(DISTINCT f.order_code)`), theo `date`, `group_name`.
- Có thể lọc theo nhóm kênh (B2B/B2C).

## 3. Gotchas
- **Vendor 3HK** lưu `'3HK DATAPOOL'` (có dấu cách) → lọc `REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL'`.
- Created mode → margin = 0.
- Đây là hiệu suất **bán ra theo vendor** (không phải giá vốn/COGS catalog — cái đó ở SP Hệ Thống).
