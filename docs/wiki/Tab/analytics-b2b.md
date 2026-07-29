---
title: "B2B Performance (Hiệu Suất Bán Sỉ B2B)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, b2b]
created: 2026-06-28
updated: 2026-07-28
status: active
---

# B2B Performance (Hiệu Suất Bán Sỉ B2B)

Hiệu suất kênh sỉ B2B: doanh thu/margin/units theo kênh & sub-channel, tách **Strategic vs Non-Strategic partners**, trend theo tháng. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/b2b` — `web/src/app/(dashboard)/analytics/b2b/page.tsx` |
| API (KPI/trend) | `/api/analytics/b2b/{kpis, performance, strategic-performance, trend}` |
| API (chi phí KH) | `/api/analytics/b2b-customer-costs?month=YYYY-MM` |
| Nguồn doanh thu | fact (Fulfillment/Sales) + `dim_order_source` · `dim_customer` · `dim_sku` · `dim_staff` |
| Nguồn chi phí KH | **Turso** `b2b_customer_cost_monthly` — chi phí per-customer nhập thủ công |
| Config | Tier keywords (Supabase `quarterly_settings`) · Partner Tiers (`app_settings`) |

## 2. Lọc & phân loại
- Toàn bộ lọc `WHERE UPPER(s.group_name) = 'B2B'`.
- **Strategic** = kênh nằm trong partner tiers "Strategic" → `channel_name ILIKE ANY(...)`.
- **Tier (B2B Tier Performance)**: phân loại theo `price_list_name` từ `dim_customer`:
  - Dùng `tierKeywords` từ `quarterly-settings` API (giống Quarter Report).
  - Không có keyword nào khớp → xếp vào Strategic (default).
  - Tên bảng tier: Strategic / VIP / Gold / Silver.
- Trả về: `channel`, `sub_channel`, `revenue`, `margin`, `units`, `customer_code`, `price_list_name`, theo `month`.

## 3. Section chính
- **KPI cards**: Revenue, GP, CM1, Margin%, CM1% — cả Actual và Projected.
- **Revenue & CM1 Trend**: chart line/bar theo tuần/tháng.
- **Strategic Partners Performance**: bảng riêng đối tác chiến lược, có sub-channels.
- **B2B Tier Performance**: tất cả KH còn lại phân theo tier, có collapse/expand per tier.

## 4. CH.Cost trong B2B Tier Performance

**Luồng CH.Cost (từ 2026-07-28):**
1. FE gọi `/api/analytics/b2b-customer-costs?month=YYYY-MM` khi load.
2. Build `b2bCostMap: Record<customer_code, { cost_lines: [{label, type, value}] }>`.
3. Mỗi row trong bảng:
   - Nếu **có data Turso** cho `customer_code` đó → `CH.Cost = calcChCost(lines, revenue)`
     - `amount` type: cộng trực tiếp (VND cố định).
     - `percent` type: áp % lên revenue.
   - Nếu **chưa có data** → fallback `CH.Cost = margin - gpm2` (channel costs từ API).
   - `CM1 = GP - CH.Cost` (tính lại từ Turso nếu có).
4. **Expanded row** (click KH): hiển thị `cost_lines` ĐỘNG (label + value từ Turso).
   - Không còn 4 ô cố định (`ads`, `platformFee`, `sponsorProducts`, `media`).
   - Nếu chưa nhập → "Chưa có dữ liệu chi phí cho khách hàng này".
5. **TOTAL OTHERS row**: tổng CH.Cost + CM1 tính lại từ Turso data.

**Nhập chi phí KH B2B:** Dùng API `POST /api/analytics/b2b-customer-costs` với body `{ costs: [{month, customer_code, cost_type, cost_value, cost_lines}] }`.

**Cấu trúc cost_lines:**
```json
[
  { "label": "Platform Fee", "type": "percent", "value": 5 },
  { "label": "Quảng cáo tháng 7", "type": "amount", "value": 2000000 }
]
```

## 5. Manage Costs — ĐÃ NGẮT (2026-07-28)

Nút "Manage Costs" và `CostManagementModal` đã **xóa hoàn toàn** khỏi tab B2B Performance.
- Lý do: tách biệt chi phí channel-level (Manage Costs) với chi phí per-customer (Turso).
- Muốn nhập chi phí KH B2B → dùng API trực tiếp hoặc tạo UI riêng.
- Muốn quản lý channel costs → dùng tab khác có Manage Costs (nếu còn).

## 6. Gotchas
- `dim_customer`: 355k rows, 99.7% là B2C với `price_list_name=NULL` → luôn dùng `LEFT JOIN`.
- Danh sách Strategic partners cấu hình ở **Settings → Partner Tiers**.
- Created mode → margin/CM1 = 0 (fact_sales_revenue không có gross_profit).
- Phân quyền: Admin, Creator, BOD, Manager, Staff.
- `calcChCost` chỉ dùng tháng `startDate.slice(0,7)` — multi-month range không tổng hợp nhiều tháng.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` WHERE `group_name='B2B'` |
| GP (Gross Profit) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` = Revenue − COGS |
| CM1 | GP − CH.Cost | GP trừ chi phí kênh từ Turso hoặc fallback channel API |
| CH.Cost (per customer) | Turso `b2b_customer_cost_monthly` | `cost_lines`: `amount` (VND cố định) hoặc `percent` (% revenue) |
| Tier (B2B) | `dim_customer.price_list_name` | `tierKeywords` từ `quarterly-settings`; Strategic/VIP/Gold/Silver |
| Channel (B2B) | `dim_order_source.channel_name` | JOIN `f.order_source_code = dim_order_source.code` |
| Strategic Partners | Supabase `app_settings` Partner Tiers | `channel_name ILIKE ANY(strategic_list)` |
| Units / Orders | `fact_fulfillment_revenue` | `SUM(fulfilled_quantity)` / `COUNT(DISTINCT order_code)` |
