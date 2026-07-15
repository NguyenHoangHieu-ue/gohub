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
- Chế độ **Created** → margin/COGS = 0 (bảng sales không có) → GP/CM1/3HK-contribution chỉ có nghĩa ở **Fulfillment**.
- 3HK match bằng `vendor ILIKE '3HKDATAPOOL'` (TRIM, ILIKE thẳng — tương đương REPLACE-space vì dữ liệu vendor 3HK).
- Phân quyền nền: Admin, Creator, BOD, Manager.
