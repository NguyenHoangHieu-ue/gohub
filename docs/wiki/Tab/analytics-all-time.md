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
- **`derived_group`** (s131, 2026-08-03): suy từ `group_name` + **KHÁCH `price_list_name`** → `B2B-Strategic`, `B2B-Non-Strategic`, `B2C`. Đọc cấu hình chung **`quarterly-settings`** qua `getCustomerStrategicSql()` (CÙNG nguồn Quarter Report — chỉnh 1 chỗ mọi tab theo; cache key kèm hash config). Default: Strategic=NULL/không VIP-Gold-Silver; exclude B2C Customer US/VN + B2B Ops. Nhất quán Dashboard/BOD (ISSUE-DASH-4). *Trước dùng `partner_tiers` (KÊNH) đang rỗng → Strategic=0.* Filter `customerTier` cũng theo định nghĩa này.
- Trả: `period`, `derived_group`, `channel_name`, `revenue`, `margin`, `tier`.

## 3. Gotchas
- **⚠️ Fix s162 (2026-08-26) — thiếu Turso B2B per-customer cost**: `gpm2` (CM1) trước chỉ trừ
  `analytics_channel_costs` (Supabase channel-level, gần như rỗng cho B2B) + group cost → CM1 B2B cao hơn thực
  tế, khác Quarter Report cùng kỳ. Nay B2B-Strategic/B2B-Non-Strategic đổi sang Turso `b2b_customer_cost_monthly`
  (query customer×tháng riêng, CÙNG phân loại Strategic/Non), B2C/Other giữ nguyên channel cost cũ.
- **⚠️ Bug tồn tại (chưa fix, phát hiện cùng lúc s162)**: query chính (`rows`) dùng `isStrategicSql`/`excludeList`
  tham chiếu alias `c` (`dim_customer`) trong CASE nhưng KHÔNG có `LEFT JOIN dim_customer c` trong `FROM` — chỉ
  không lỗi khi `tierKeywords`/`excludedCustomers` rỗng (biểu thức rút gọn còn `(TRUE)`/không tham chiếu `c`).
  Cần Hiếu xác nhận có đang lỗi thật không trước khi sửa (đổi query gốc, ngoài phạm vi fix cost model lần này).
- **Group cost B2B (BOD-1, 2026-08-02)**: chi phí group-level `B2B` chia theo **revenue-share** giữa B2B-Strategic & B2B-Non-Strategic (KHÔNG cộng đầy đủ vào cả 2 → tránh đếm 2 lần). Hiện Supabase chưa có B2B group cost → 0 tác động; fix để đúng khi nhập. (Giống `bod-data.ts`.)
- **Amount-type channel op-cost (s131)**: khi 1 channel có cả KH Strategic lẫn Non → chia theo revenue-share per (tháng, channel) để KHÔNG cộng 2 lần (percent-type theo revenue nên đúng sẵn).
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

