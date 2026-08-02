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
- **Group cost B2B (BOD-1, 2026-08-02)**: chi phí group-level `B2B` chia theo **revenue-share** giữa B2B-Strategic & B2B-Non-Strategic (KHÔNG cộng đầy đủ vào cả 2 → tránh đếm 2 lần). Hiện Supabase chưa có B2B group cost → 0 tác động; fix để đúng khi nhập. (Giống `bod-data.ts`.)
- `tier` (Strategic/Non) lấy từ Partner Tiers (Supabase). Kênh B2B không thuộc Strategic → Non-Strategic.
- Không giới hạn kỳ ngắn → dữ liệu lớn, dựa vào cache 12h.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(fulfilled_revenue_amount_vnd)` toàn thời gian |
| Margin (GP) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` = Revenue − COGS |
| Period | `fact_fulfillment_revenue.fulfiled_date` | GROUP BY tháng/năm (`period`) |
| Channel | `dim_order_source.channel_name` | JOIN `f.order_source_code = dim_order_source.code` |
| Derived Group | `dim_order_source.group_name` + Partner Tiers | B2B-Strategic / B2B-Non-Strategic / B2C |
| Tier (B2B) | Supabase `app_settings` Partner Tiers | `channel_name ILIKE ANY(strategic_list)` → Strategic |
