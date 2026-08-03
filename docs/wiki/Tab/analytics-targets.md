---
title: "Manage Costs (Target & Chi phí B2C)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, targets, cost]
created: 2026-06-28
updated: 2026-08-03
status: active
---

# Manage Costs (Target & Chi phí B2C)

> **s131 (2026-08-03) đổi tên "KPI / Target" → "Manage Costs"**: tab nay tập trung Target **B2C** + chi phí B2C.
> B2B đã bỏ khỏi các bảng target (B2B cost/target quản ở **Quarter Report** — nhập cost per-KH qua ô Ch.Cost).

Đặt & theo dõi KPI/Target **B2C** theo tháng (doanh thu, CM1%, 3HK%…), đối chiếu **kế hoạch vs thực tế**, + KPI Target B2C (VN/US/Total) + Ngân sách Marketing B2C + **nhập chi phí B2C** (nút "Chi phí B2C" → CostManagementModal scope=b2c: Ads/Platform/Sponsor/Media theo kênh + B2C group cost). Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/targets` — `web/src/app/(dashboard)/analytics/targets/page.tsx` |
| API | `/api/analytics/targets-summary`, `/api/planning/targets`, `/api/config/b2c-kpi-targets`, `/api/config/b2c-budget` |
| Nguồn | **Supabase** `analytics_target_planning` (kế hoạch) + `gohub_dw` (thực tế) |

## 2. Nội dung
- **3 bảng Target (Revenue / 3HK% / CM1%)**: **chỉ còn dòng B2C** (s131 bỏ B2B — B2B quản ở Quarter Report). So với thực tế lấy từ analytics DB.
- **B2C KPI Target** (VN/US/Total) + **B2C Budget** (marketing) — mỗi vùng có nút Lưu **dirty-state** (chỉ sáng khi có thay đổi — s90).
- **Chi phí B2C** (s131): nút "Chi phí B2C" ở header → mở `CostManagementModal` scope=b2c (Ads/Platform/Sponsor/Media theo kênh B2C + B2C group cost). Đây là "manage cost" B2C trước đây bị gỡ khỏi tab B2C, nay gộp về đây.

## 3. Gotchas
- Kế hoạch = Supabase (creator/admin sửa được); thực tế = gohub_dw.
- Nút Lưu dirty-state: snapshot lúc load → so sánh → `disabled` khi chưa đổi.
- B2B targets cũ (nếu đã nhập) VẪN lưu trong `analytics_target_planning` (không xoá), chỉ ẩn khỏi UI tab này.
- Chỉ admin/creator (hoặc writable_tabs chứa "targets") thấy nút "Chi phí B2C" + sửa được.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Target (kế hoạch) | Supabase `analytics_target_planning` | Revenue/CM1/3HK% target per month; creator/admin nhập |
| Actual Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` per month từ gohub_dw |
| Actual GP | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` per month |
| B2C KPI Target | Supabase `app_settings` (key `b2c_kpi_targets`) | CAC/ROAS/Leads target per month |
| B2C Marketing Budget | Supabase `analytics_channel_costs` | Budget B2C Channels per month |
| Progress % | Actual / Target × 100 | So sánh live từ gohub_dw vs kế hoạch Supabase |
