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
- **3HK revenue (STAFF-1, 2026-08-02)**: định nghĩa 3HK dùng `REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'` (chuẩn toàn hệ thống, 7.930 SKU). Trước đây dùng `LIKE '3HK%'` (7.991 SKU) → gồm dư 61 SKU vendor `3HK` (không phải datapool). Đã sửa cả 4 query (staff-report + staff-report/customers, summary + monthly). Chênh T7 = 0đ (61 SKU đó không có doanh thu T7) nhưng đảm bảo nhất quán về sau.
- Loại nhân viên hệ thống: `staff_name != 'Auto ESIM'`; SKU nhiễu `SHIPPINGFEE0`.
- Nhân viên không map → `TRIM(staff_code)` / "Unknown".
- Từng có bug NaN khi staff null → đã COALESCE.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` GROUP BY `staff_code` |
| GP (Margin) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` per staff |
| CM1 | GP − phân bổ Operation Cost | GP − `analytics_channel_group_costs.amount` phân bổ theo revenue share của staff |
| Orders | `fact_fulfillment_revenue.order_code` | `COUNT(DISTINCT order_code)` per staff |
| Units | `fact_fulfillment_revenue.fulfilled_quantity` | `SUM(fulfilled_quantity)` per staff |
| Staff Name | `dim_staff.name` | JOIN `TRIM(f.staff_code) = TRIM(dim_staff.code)` |
| Operation Cost | Supabase `analytics_channel_group_costs` | Phân bổ theo tỷ lệ revenue của từng staff |


---

## § Filter Chuẩn (s132 — 2026-08-04)

Từ s132, tất cả tab analytics có 3 filter:

| Filter | Default | Ý nghĩa |
|--------|---------|---------|
| `includeShip` | **Off** | Bao gồm phí ship (`sku = SHIPPINGFEE0`). Mặc định loại — doanh thu SP thuần |
| `includeInternalOps` | **Off** | Bao gồm đơn nội bộ (`group_name = INTERNAL-TRANSACTION`). Mặc định loại — GP âm do SIM nội bộ |
| `includeOpsCustomers` | **Off** (B2B/B2C) | Bao gồm KH ops (B2B Ops, B2C Customer US/VN). Mặc định loại khỏi B2B/B2C total |

**Khi bật CẢ 3 → khớp số liệu raw `gohub_dw` (dùng để validate).**

UI: checkbox nhỏ bên cạnh nút Apply Filters / Lọc trong filter bar.

