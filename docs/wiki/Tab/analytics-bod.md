---
title: "Board of Directors Report (Báo Cáo Quản Trị BOD)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, bod]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# Board of Directors Report (Báo Cáo Quản Trị BOD)

Báo cáo tài chính tổng hợp cấp điều hành: Revenue, COGS, Gross Profit, GPM%, CM1, và **3HK Contribution %**. Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/bod` — `web/src/app/(dashboard)/analytics/bod/page.tsx` |
| API | `/api/analytics/bod-summary`, `/api/analytics/bod-report`, `/api/analytics/bod-channel-performance`, `/api/analytics/bod-group-margin` |
| Logic | `lib/bod-data.ts` (`fetchBODGroupMarginData`, `fetchBODChannelPerformanceData`) |
| Nguồn | `fact_fulfillment_revenue` (+ `fact_sales_revenue` khi toggle Created) · `dim_order_source` · `dim_sku` |

## 2. Chỉ số & công thức
- **Revenue / COGS / Gross Profit / GPM%** — theo `getAnalyticsSource` (mục 4 & 7 của data-model).
- **CM1 / CM1%** — GP trừ Operation Cost (phí sàn/ads…). *(label cũ GP2/GPM2)*
- **3HK Contribution %** = `SUM(revenue WHERE vendor 3HK) / SUM(total revenue) × 100`. Có so sánh **kỳ trước** + **cùng kỳ năm trước** (prev / prevYear).

## 3. Cách tính 3HK Contribution (bod-summary)
```sql
SELECT SUM(CASE WHEN TRIM(f.sku) IN
         (SELECT DISTINCT TRIM(sku) FROM dim_sku WHERE TRIM(vendor) ILIKE '3HKDATAPOOL')
       THEN f.<revenueCol> ELSE 0 END) AS r
FROM <mainTable> f WHERE <dateFilter> <extraFilters>
```
→ `total_3hk_contribution = total_3hk_revenue / total_revenue × 100`.

## 4. Section chính
- **KPI cards**: Revenue, GP, GPM%, CM1, CM1%, 3HK Contribution % (kèm ▲▼ so kỳ trước / năm trước).
- **Group Margin** (`bod-group-margin`): margin theo nhóm kênh (B2B-Strategic / B2B-Non-Strategic / B2C).
- **Channel Performance** (`bod-channel-performance`): doanh thu/margin theo tháng × kênh.

## 5. Gotchas
- **⚠️ Định nghĩa B2B-Strategic (s131, 2026-08-03)**: **Group Margin cards** (`bod-group-margin` → `fetchBODGroupMarginData`) và **bod-summary** phân B2B-Strategic/Non theo **KHÁCH `price_list_name`**, đọc cấu hình chung **`quarterly-settings`** (`quarterly_tier_keywords` + `quarterly_excluded_customers`) qua `getCustomerStrategicSql()` — CÙNG nguồn với Quarter Report (chỉnh 1 chỗ, mọi tab theo). Default: Strategic = NULL/không VIP-Gold-Silver; Non = VIP/Gold/Silver; exclude B2C Customer US/VN + B2B Ops. Cache key kèm hash config → tự tươi khi đổi. Nhất quán Dashboard/tier-performance/All-Time (ISSUE-DASH-4). Trước dùng `partner_tiers` (KÊNH) đang rỗng → Strategic=0. Channel op-cost amount-type chia theo revenue-share khi 1 channel span 2 tier (tránh cộng 2 lần). Tổng B2B revenue GIỮ NGUYÊN (verify T7: Strategic 5,22 tỷ + Non 1,04 tỷ = 6,26 tỷ). **LƯU Ý**: bảng chi tiết "**Strategic Channels**" (per-đối-tác, `b2b/strategic-performance`) VẪN theo `partner_tiers` (đang rỗng → có thể trống) — Hiếu chốt giữ view này riêng, chưa đổi.
- **Group cost B2B (BOD-1, 2026-08-02)**: chi phí group-level `B2B` (Turso `analytics_channel_group_costs`) được **chia theo revenue-share** giữa B2B-Strategic & B2B-Non-Strategic (KHÔNG cộng đầy đủ vào cả 2 → tránh đếm 2 lần). Áp cho `fetchBODGroupMarginData` (revenue-share per group) và daily `fetchBODReportData` (dedupe theo tursoGroupName vì là TỔNG). Hiện Supabase chưa có B2B group cost → 0 tác động số; fix để đúng ngay khi nhập. Xem cả `all-time-performance`.
- **Nút Download 2 chart (BOD-2, 2026-08-02)**: "Revenue vs COGS" + "Margin Analysis (%)" trước là nút chết (không onClick) → đã wire `exportRevenueCogsCSV` (Date/Revenue/COGS/CM1) + `exportMarginAnalysisCSV` (Date/Margin%/CM1%) xuất .xlsx.
- **Total GP gồm "Internal Ops" (DATA-QUALITY, 2026-08-02)**: Total GP cộng cả nhóm `Internal-Transaction`/`Misc.` (SIM tiêu dùng nội bộ, COGS thật + revenue 0 → GP âm, vd T7 −14tr) → Total GP ≠ B2B+B2C GP. Chốt (Hiếu): GIỮ (chi phí thật), không loại. Orders tab mặc định loại (`includeInternalOps=No`).
- Chế độ **Created** → margin/COGS = 0 (bảng sales không có) → GP/CM1/3HK-contribution chỉ có nghĩa ở **Fulfillment**.
- 3HK match bằng `vendor ILIKE '3HKDATAPOOL'` (TRIM, ILIKE thẳng — tương đương REPLACE-space vì dữ liệu vendor 3HK).
- Phân quyền nền: Admin, Creator, BOD, Manager.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(fulfilled_revenue_amount_vnd)` GROUP BY month |
| GP (Gross Profit) | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` = Revenue − COGS |
| GPM% | Tính từ GP / Revenue | `GP / Revenue × 100` |
| CM1 | GP − Operation Cost | GP − `SUM(analytics_channel_group_costs.amount)` theo group |
| CM1% | CM1 / Revenue × 100 | Tính từ 2 cột trên |
| 3HK Contribution % | `fact_fulfillment_revenue` + `dim_sku.vendor` | `SUM(revenue WHERE vendor ILIKE '3HKDATAPOOL') / SUM(total_revenue) × 100` |
| Operation Cost | Supabase `analytics_channel_group_costs` | `SUM(amount)` WHERE `group_name` IN ('B2B','B2C') theo tháng |
| Group Margin | `fact_fulfillment_revenue` + `dim_order_source.group_name` | B2B-Strategic / B2B-Non-Strategic / B2C breakdown |
| Channel Performance | `fact_fulfillment_revenue` + `dim_order_source.channel_name` | Revenue/margin theo tháng × kênh |


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

