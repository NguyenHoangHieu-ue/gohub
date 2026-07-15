---
title: "Staff Performance (Hiệu Suất Nhân Viên)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, staff]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Staff Performance (Hiệu Suất Nhân Viên)

Leaderboard nhân viên theo doanh thu / số đơn / units. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/staff` — `web/src/app/(dashboard)/analytics/staff/page.tsx` |
| API | `/api/staff-performance`, `/api/staff`, `/api/staff-list` |
| Nguồn | fact + `dim_staff` (code, name) |

## 2. Chỉ số trả về
`staff_code`, `staff_name`, `total_revenue`, `total_orders`, `total_units` — sắp xếp giảm dần (leaderboard).

## 3. Gotchas
- Loại nhân viên hệ thống: `staff_name != 'Auto ESIM'`; SKU nhiễu `SHIPPINGFEE0`.
- Nhân viên không map → `TRIM(staff_code)` / "Unknown".
- Từng có bug NaN khi staff null → đã COALESCE.
