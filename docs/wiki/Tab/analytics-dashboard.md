---
title: "BI Dashboard (Bảng Điều Khiển Tổng Quan)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, dashboard]
created: 2026-06-28
updated: 2026-07-20
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
- **Monthly Performance Summary** (`monthly-kpis`): bảng Revenue / Gross Profit / CM1 / CM1% / 3HK Revenue / 3HK% cho 3 tháng gần nhất, có dự phóng tháng hiện tại. Tháng hiện tại đánh dấu `×factor PR`. Bên dưới có breakdown theo Strategic Channels.
- **Pro-rata Projection**: dự phóng KPI cuối tháng khi dữ liệu chưa hoàn thiện.
- **Target Progress**: so sánh doanh thu thực tế vs kế hoạch.

## 4. Báo cáo Quý (s112)
Button **"Báo cáo Quý"** (BarChart3 icon, góc phải header) → modal overlay toàn màn hình:
- Chọn Q1/Q2/Q3/Q4 + năm → bấm **Xem báo cáo**
- **Bảng TỔNG HỢP**: mỗi tháng 1 hàng (click để mở B2B/B2C sub-row) + hàng tổng quý cuối. Cột: Revenue · Gross Margin · GP% · Ch.Cost · Group Cost · **CM1** · **CM1%**. Tháng hiện tại đánh dấu `PR` (pro-rata).
- **CHI TIẾT B2B**: bảng kênh × tháng (Revenue / GP / Ch.Cost / CM1 / %MoM).
- **CHI TIẾT B2C**: tương tự B2B.
- Công thức: CM1 = Gross Profit − Channel Cost − Group Cost. Pro-rata: doanh thu/GP nhân factor `daysInMonth/elapsed`; Group Cost = nguyên ngân sách tháng (committed).
- API: `GET /api/analytics/quarterly-report?quarter=Q3&year=2026&dateColumn=fulfiled_date&companyCode=ALL`

## 5. Gotchas
- **B2B — Phân khúc** (trong "Performance by Channels", API `/api/analytics/b2b/tier-performance`): cột **"Unit Sold" (2026-08-02, BUG-DASH-1) ĐÃ sửa `COUNT(*)` → `SUM(fulfilled_quantity)`**. Trước đây đếm số DÒNG line-item nên units B2B thiếu ~49% (vd T7: hiện 26.677 vs thật 52.372). Phân loại tier từ `dim_customer.price_list_name`; exclude B2C Customer US/VN + B2B Ops.
- **Line chart "Monthly Gross Revenue by Sources"** (`revenue-chart`): line **B2B Non-Strategic (2026-08-02, BUG-DASH-2) ĐÃ sửa** `channel_name NOT ILIKE ANY(...)` → `NOT (channel_name ILIKE ANY(...))`. Foot-gun cũ: `NOT ILIKE ANY` trả true khi kênh không khớp *ít nhất một* pattern → kênh Strategic bị đếm luôn vào Non-Strategic (line phồng). Verify live T7: cách cũ non-strat=26.680 (= toàn bộ B2B, trùng 3.612 strategic) → cách đúng 23.068 (3.612 + 23.068 = 26.680 total).
- Region map: nước đích suy từ SKU + `country_codes` (Turso), KHÔNG dùng `dim_location`.
- Toggle Fulfillment/Created + khoảng ngày áp cho tất cả khối.
- Created mode → `marginCol = "0"` → GP/CM1 = 0 (fact_sales_revenue không có margin). Nên dùng Fulfillment khi cần CM1.
- `analytics_monthly_kpis` Supabase: bảng snapshot CM1 theo tháng, cron `refresh-monthly-kpis` chạy 00:00 UTC daily. Chatbot query bảng này để trả lời câu hỏi về CM1/revenue/3HK theo tháng cụ thể.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Revenue KPI | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` kỳ hiện tại + kỳ trước (MoM) |
| Revenue Chart | `fact_fulfillment_revenue` | GROUP BY `fulfiled_date::date` → trend theo ngày |
| Region Chart | `fact_fulfillment_revenue` + `country_codes` (Turso) | Country suy từ SKU + Turso mapping |
| Performance by Source | `fact_fulfillment_revenue` + `dim_order_source.code` | GROUP BY `order_source_code` |
| Performance by Channel | `dim_order_source.channel_name` | GROUP BY `channel_name` |
| Recent Orders | `fact_fulfillment_revenue` | ORDER BY `fulfiled_date` DESC LIMIT N |
| Monthly KPI Summary | Supabase `analytics_monthly_kpis` | Snapshot: Revenue/GP/CM1/CM1%/3HK% per month; cron refresh hàng ngày |
| Pro-rata Projection | `fact_fulfillment_revenue` | `revenue_mtd × (days_in_month / elapsed_days)` |
| Target Progress | Supabase `analytics_target_planning` | So sánh revenue thực vs kế hoạch |
| Quarterly Report | `fact_fulfillment_revenue` + `dim_customer` + `analytics_channel_costs` | API `/api/analytics/quarterly-report` |
