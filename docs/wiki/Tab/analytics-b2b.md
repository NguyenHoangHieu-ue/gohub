---
title: "B2B Performance (Hiệu Suất Bán Sỉ B2B)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, b2b]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# B2B Performance (Hiệu Suất Bán Sỉ B2B)

Hiệu suất kênh sỉ B2B: doanh thu/margin/units theo kênh & sub-channel, tách **Strategic vs Non-Strategic partners**, trend theo tháng. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/b2b` — `web/src/app/(dashboard)/analytics/b2b/page.tsx` |
| API | `/api/analytics/b2b/{kpis, performance, strategic-performance, trend}` |
| Nguồn | fact (Fulfillment/Sales) + `dim_order_source` · `dim_customer` · `dim_sku` · `dim_staff` |
| Config | Partner Tiers (Supabase `app_settings`) — danh sách Strategic partners |

## 2. Lọc & phân loại
- Toàn bộ lọc `WHERE UPPER(s.group_name) = 'B2B'`.
- **Strategic** = kênh nằm trong danh sách partner tiers "Strategic" → `channel_name ILIKE ANY(...)`. `strategic-performance` tách riêng nhóm này.
- Trả về: `channel`, `sub_channel` (sub_group_name), `revenue`, `margin`, `units`, `group_name`, theo `month`.

## 3. Section chính
- **KPI**: Revenue, GP, CM1, units, orders (B2B).
- **Performance theo kênh/sub-channel** + **trend tháng**.
- **Strategic Performance**: bảng riêng cho đối tác chiến lược (2 key metric team Business).

## 4. Gotchas
- Danh sách Strategic partners cấu hình ở **Settings → Partner Tiers** (không hard-code).
- Created mode → margin/CM1 = 0.
- Phân quyền nền: Admin, Creator, BOD, Manager, Staff.
- **Nút "Manage Costs"** (mở CostManagementModal): TẠM THỜI chỉ **creator** thấy (`dbRole === "creator"` qua `useDbRole()`). Các role khác không thấy nút. Muốn mở lại cho admin → sửa điều kiện ở `analytics/b2b/page.tsx`.
