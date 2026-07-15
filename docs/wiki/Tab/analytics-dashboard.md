---
title: "BI Dashboard (Bảng Điều Khiển Tổng Quan)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, dashboard]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# BI Dashboard (Bảng Điều Khiển Tổng Quan)

Trang tổng quan analytics: KPI doanh thu, biểu đồ doanh thu theo thời gian, theo vùng/nguồn/kênh, đơn gần đây. Có **dải tab thị trường All / VN / US** (s90). Dùng data model chung — xem [[_analytics-data-model]].

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics` — `web/src/app/(dashboard)/analytics/page.tsx` |
| API | `/api/analytics/{kpis, revenue-chart, region-chart, performance-source, performance-channel, recent-orders}` |
| Nguồn | fact (Fulfillment/Sales) + `dim_order_source` + `country_codes` (Turso, cho region) |

## 2. Tab thị trường US/VN/All (s90)
- Dải segmented **All / VN / US** ngay dưới header → set state `companyCode` (`ALL`/`VN`/`US`).
- **Backend đã hỗ trợ sẵn** `companyCode` ở mọi API (lọc `f.company_code`) — tab chỉ đổi tham số, không đụng SQL.
- Đã bỏ dropdown "Company" trùng trong panel Filters (tab thay thế).

## 3. Các khối
- **KPI cards** (`kpis`): revenue + so kỳ trước.
- **Revenue chart** (`revenue-chart`): doanh thu theo ngày.
- **Region chart** (`region-chart`): theo nước đích (map qua `country_codes`).
- **Performance by source / channel**: theo nguồn / kênh.
- **Recent orders**: đơn gần nhất.

## 4. Gotchas
- Region map: nước đích suy từ SKU + `country_codes` (Turso), KHÔNG dùng `dim_location`.
- Toggle Fulfillment/Created + khoảng ngày áp cho tất cả khối.
- Created mode → margin = 0.
