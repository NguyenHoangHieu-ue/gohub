---
title: "All-Time Report (Báo Cáo Hiệu Suất Lịch Sử)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, all-time]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# All-Time Report (Báo Cáo Hiệu Suất Lịch Sử)

Doanh thu/margin đa năm theo kỳ (period), tách 3 nhóm phái sinh: **B2B-Strategic / B2B-Non-Strategic / B2C**. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/all-time` — `web/src/app/(dashboard)/analytics/all-time/page.tsx` |
| API | `/api/analytics/all-time-performance` |
| Nguồn | `fact_fulfillment_revenue` + `dim_order_source` + `dim_customer` |

## 2. Logic
- Gom theo `period` (tháng/năm) × `derived_group`.
- **`derived_group`**: suy từ `group_name` + partner tier → `B2B-Strategic`, `B2B-Non-Strategic`, `B2C`.
- Trả: `period`, `derived_group`, `channel_name`, `revenue`, `margin`, `tier`.

## 3. Gotchas
- `tier` (Strategic/Non) lấy từ Partner Tiers (Supabase). Kênh B2B không thuộc Strategic → Non-Strategic.
- Không giới hạn kỳ ngắn → dữ liệu lớn, dựa vào cache 12h.
