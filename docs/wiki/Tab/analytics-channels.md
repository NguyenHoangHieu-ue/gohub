---
title: "Channel Performance (Hiệu Suất Kênh Bán Hàng)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, channels]
created: 2026-06-28
updated: 2026-07-28
status: active
---

# Channel Performance (Hiệu Suất Kênh Bán Hàng)

Tab 2 mode: **All Channels Overview** (tổng hợp tất cả kênh) và **Single Channel Deep-Dive** (phân tích chi tiết 1 kênh). Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/channels` — `web/src/app/(dashboard)/analytics/channels/page.tsx` |
| API overview | `/api/analytics/channels/performance` — tất cả kênh, có CM1 |
| API deep-dive | `/api/analytics/query` (POST SELECT) — query trực tiếp gohub_dw |
| Chi phí kênh | Supabase `analytics_channel_costs` + `analytics_channel_group_costs` |

## 2. Hai chế độ xem

### 2a. All Channels Overview (mới từ 2026-07-28)
**Khi nào:** Dropdown chọn `"All Channels (Overview)"` (giá trị rỗng `""`).

**API:** `GET /api/analytics/channels/performance?startDate=&endDate=&dateColumn=&channelGroup=`

**Dữ liệu trả về per kênh:** `channel`, `group_name`, `is_strategic`, `revenue`, `margin`, `margin_percent`, `gpm2` (CM1), `gpm2_percent`, `units`, `orders`, `prev_revenue`, `mom` (MoM%).

**Bảng hiển thị:** Channel | Group | Revenue | GP | Margin% | CM1 | CM1% | Orders | Units | MoM

**Tương tác:** Click vào tên kênh → tự navigate sang Single Channel Deep-Dive mode cho kênh đó.

**Tổng (TOTAL row):** Tự tính sum tất cả kênh đang hiển thị.

### 2b. Single Channel Deep-Dive
**Khi nào:** Dropdown chọn 1 kênh cụ thể.

**Gồm các section:**
- **Pro-rata Projection** (nếu đang tháng hiện tại): dự phóng cuối tháng.
- **KPI Cards**: Revenue, GP, CM1, Orders, Units, AOV.
- **Revenue Trend**: biểu đồ ngày.
- **Performance Breakdown**: breakdown theo sub-channel (từ `dim_order_source.sapo_name`).
- **Daily Performance Details**: bảng ngày.
- **Top Selling Products**: top SKU của kênh đó.

**Channel filter trong SQL:**
```sql
(order_source_code IN (SELECT code FROM dim_order_source WHERE TRIM(channel_name) = '<channel>')
 OR TRIM(customer_code) IN (SELECT TRIM(code) FROM dim_customer WHERE TRIM(name) = '<channel>')
 OR TRIM(customer_code) = '<channel>')
```

## 3. Query chính — `channels/performance` API

```sql
WITH cur AS (
  SELECT TRIM(s.channel_name) AS channel, UPPER(s.group_name) AS group_name,
         CASE WHEN s.channel_name ILIKE ANY(ARRAY[<strategic_list>]) THEN true ELSE false END AS is_strategic,
         SUM(f.<revenueCol>) AS revenue, SUM(f.<marginCol>) AS margin,
         SUM(f.<quantityCol>) AS units, COUNT(DISTINCT f.order_code) AS orders
  FROM <mainTable> f LEFT JOIN dim_order_source s ON f.order_source_code = s.code
  WHERE <dateFilter> <groupFilter>
  GROUP BY 1, 2, is_strategic
),
prv AS ( ...revenue kỳ trước theo channel... )
SELECT c.*, COALESCE(p.revenue,0) AS prev_revenue
FROM cur c LEFT JOIN prv p ON c.channel = p.channel
ORDER BY c.group_name, c.revenue DESC;
```

**CM1 trong API:** `gpm2 = margin - opCost` — opCost tổng hợp từ:
- B2B: Turso `b2b_customer_cost_monthly` (per-customer, **fix s162** — trước dùng `analytics_channel_costs`
  gần như luôn rỗng cho B2B → CM1 B2B cao ảo), phân bổ vào từng channel theo revenue-share (Turso không có
  dimension channel).
- B2C/Other: `analytics_channel_costs` per kênh (ads/platform_fee/sponsor_products/media × ratio ngày) — không đổi.
- Mọi group: `analytics_channel_group_costs` phân bổ theo revenue share.

## 4. Manage Costs — ĐÃ NGẮT (2026-07-28)

Nút "Manage Costs" và `CostManagementModal` đã **xóa hoàn toàn** khỏi tab Channel Performance.
- Lý do: tạm thời tách biệt luồng nhập cost khỏi các tab analytics.
- Data cost đã nhập trong `analytics_channel_costs` vẫn còn nguyên, API vẫn đọc để tính CM1.
- Muốn nhập cost lại → cần khôi phục button trong `page.tsx`.

## 5. Gotchas
- **Fix s162**: `channels/kpis` (KPI card) cũng đổi sang Turso per-customer cost khi scope là B2B (channelGroup=B2B
  hoặc 1 channel cụ thể thuộc nhóm B2B) — trước cùng lỗi analytics_channel_costs rỗng như bảng performance.
- `groupFilter` = `AND UPPER(s.group_name) = 'B2B'|'B2C'` khi user lọc theo nhóm.
- Created mode → margin = 0 (fact_sales_revenue không có gross_profit_vnd).
- eSIM (3HK, WorldMove): `location_id = 0` ("Unknown") — bình thường, không phải lỗi.
- Channel group filter (All/B2B/B2C) ảnh hưởng danh sách kênh trong dropdown — khi đổi group, danh sách reload nhưng `selectedChannel=""` (All Channels) được giữ nguyên.
- `fetchChannels` không auto-select kênh đầu tiên nếu `selectedChannel=""` (để giữ All Channels mode).

## 6. Phân quyền
Admin, Creator, BOD, Manager, Staff đều xem được. Không có role restriction riêng cho tab này.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(fulfilled_revenue_amount_vnd)` GROUP BY channel |
| GP (Margin) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` = Revenue − COGS |
| Margin% | GP / Revenue × 100 | Tính từ 2 cột trên |
| CM1 (gpm2) | GP − Operation Cost | `margin - opCost`; B2B: Turso `b2b_customer_cost_monthly` (s162) + group cost · B2C/Other: `analytics_channel_costs` + group cost |
| CM1% (gpm2%) | CM1 / Revenue × 100 | Tính từ 2 cột trên |
| Channel | `dim_order_source.channel_name` | JOIN `f.order_source_code = dim_order_source.code` |
| Group (B2B/B2C) | `dim_order_source.group_name` | `UPPER(group_name)` |
| Is Strategic | Supabase `app_settings` Partner Tiers | `channel_name ILIKE ANY(strategic_list)` |
| CH.Cost per channel | Supabase `analytics_channel_costs` | `SUM(amount)` per `channel_name` × tháng (ads/platform/sponsor/media) |
| Group Cost | Supabase `analytics_channel_group_costs` | `SUM(amount)` per `group_name` × tháng; phân bổ theo revenue share |
| MoM% | `fact_fulfillment_revenue` kỳ trước | `(revenue_cur - revenue_prev) / revenue_prev × 100` |


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

