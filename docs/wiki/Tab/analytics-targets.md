---
title: "KPI Target Planning (Lập Kế Hoạch Chỉ Tiêu Doanh Số)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, targets]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# KPI Target Planning (Lập Kế Hoạch Chỉ Tiêu Doanh Số)

Đặt & theo dõi KPI/Target theo tháng (doanh thu, CM1, 3HK%…), đối chiếu **kế hoạch vs thực tế**. Gồm cả KPI Target B2C + Ngân sách Marketing B2C (dời về đây từ s82). Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/targets` — `web/src/app/(dashboard)/analytics/targets/page.tsx` |
| API | `/api/analytics/targets-summary`, `/api/planning/targets`, `/api/config/b2c-kpi-targets`, `/api/config/b2c-budget` |
| Nguồn | **Supabase** `analytics_target_planning` (kế hoạch) + `gohub_dw` (thực tế) |

## 2. Nội dung
- **Main plan**: nhập chỉ tiêu theo tháng; so với thực tế lấy từ analytics DB.
- **B2C KPI Target** + **B2C Budget** (marketing) — 3 vùng lưu riêng, mỗi vùng có nút Lưu **dirty-state** (chỉ sáng khi có thay đổi — s90).
- Bảng 3: đơn vị Units (bản web) — lưu ý khác intel (GPM2%). *(Còn chờ Hiếu quyết chuẩn hoá — xem session summary.)*

## 3. Gotchas
- Kế hoạch = Supabase (creator/admin sửa được); thực tế = gohub_dw.
- Nút Lưu dirty-state: snapshot lúc load → so sánh → `disabled` khi chưa đổi.
