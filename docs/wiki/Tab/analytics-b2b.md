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
- **Fix s168b (2026-08-28) — sub-channel CM1 breakdown cao hơn CM1 hàng cha**: click "View details" (expand
  1 KH trong B2B Tier Performance) trước hiện `sub_channels.gpm2` = margin thô, không trừ chCost Turso
  (per-customer) lẫn group cost share vốn đã trừ ở CM1 hàng cha (chỉ trừ cost khớp ĐÚNG TÊN sub-channel trong
  cost settings — gần như không bao giờ khớp cho B2B customer row) → tổng sub-channel CAO HƠN CM1 hàng cha (báo
  cáo thật: Momo cm1=215tr nhưng sub-channel cộng lại 437tr). Fix: track riêng cost đã trừ ĐÚNG cho 1 sub-channel
  cụ thể, phần còn lại (group cost + chCost Turso + cost "total"-mode) phân bổ theo tỷ trọng revenue giữa các
  sub-channel → Σ sub_channels.gpm2 luôn khớp CM1 hàng cha. Cùng bug (chưa lộ, do `partner_tiers` rỗng) cũng có
  ở `b2b/strategic-performance` (Strategic Partners Performance) — vá luôn cùng lúc. Cache key: `b2b-perf6`,
  `b2b-strategic2`.
- **Fix s168 (2026-08-28) — thiếu lọc KH INACTIVE**: `b2b/kpis`, `b2b/performance`, `b2b/trend` KHÔNG lọc khách
  hàng có `price_list_name` chứa "INACTIVE" (vd "[INACTIVE] Sponsor") — trong khi `quarterly-report`/
  `quarterly-b2b-customers`/`squad-progress` đã lọc từ lâu. Bất cứ KH INACTIVE nào phát sinh trong kỳ → Revenue/
  GP/CM1 B2B Performance cao hơn Quarter Report có hệ thống. Fix: helper dùng chung `excludeInactiveCustomers()`
  (`analytics-helpers.ts`), áp cho cả 3 route. Nhân tiện `b2b/trend` trước còn thiếu luôn cả 3 filter chuẩn
  (`includeShip`/`includeInternalOps`/`includeOpsCustomers`, s132) — chart trend trước không lọc gì ngoài
  group_name+date; đã thêm đủ + FE truyền param. Cache key bump: `b2b-kpis2`, `b2b-perf5`, `b2b-trend2`.
  ⚠️ **Vẫn khác theo thiết kế (không phải bug)**: Quarter Report chiếu PR (pro-rata `dim/elapsed`) cho tháng hiện
  tại ở headline; B2B Performance luôn hiển thị actual thô cho khoảng ngày chọn. So 2 tab cùng kỳ ĐÃ QUA sẽ khớp
  tuyệt đối; tháng đang chạy phải so cột "Actual" bên Quarter Report (không phải cột PR chính) mới khớp B2B
  Performance. Quarter Report cũng luôn dùng Fulfillment (không có toggle Created) — nếu B2B Performance đang
  toggle "Ngày tạo đơn" thì 2 tab không thể khớp.
- **Fix s162 (2026-08-26)**: KPI card (`b2b/kpis`) và Revenue&CM1 Trend chart (`b2b/trend`) trước dùng
  `analytics_channel_costs` (Supabase channel-level, gần như luôn rỗng cho B2B) → CM1 ở đó khác với bảng chi tiết
  bên dưới (vốn đã dùng Turso per-customer). Nay cả 2 đổi sang Turso `b2b_customer_cost_monthly`, khớp bảng chi
  tiết + Quarter Report.
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

