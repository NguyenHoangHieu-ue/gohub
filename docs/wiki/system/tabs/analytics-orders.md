---
title: "Orders (Quản Lý Đơn Hàng BI)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, orders]
created: 2026-06-28
updated: 2026-09-04
status: active
---

# Orders (Quản Lý Đơn Hàng BI)

Danh sách đơn hàng chi tiết (order_code, ngày, PIC, khách, SP, số lượng, doanh thu, GP, tier) + tổng hợp
count/revenue/GP toàn kỳ. Có export Excel đủ mọi đơn (không chỉ 1 page). Dùng data model chung — xem
[[../analytics-data-model|_analytics-data-model]].

> **s183 Phase 3 (2026-09-04)**: trang này đã GỘP với tab "Order Report" cũ từ trước (không rõ session
> nào — phát hiện khi audit code: `/analytics/order-report/page.tsx` chỉ còn 5 dòng redirect sang
> `/analytics/orders`, và trang Orders thật ra gọi API `/api/analytics/order-report` chứ không phải
> `/api/orders` như 2 file wiki cũ (`analytics-orders.md` + `analytics-order-report.md`) mỗi file mô tả
> riêng). Đã dọn: xoá route API chết `GET /api/orders` (bản cũ, không còn ai gọi) + `GET /api/staff-list`
> (thay bằng `/api/staff`, cũng không còn ai gọi); GIỮ `GET /api/orders/export` (route khác, đang được
> **Products BI** dùng — không đụng) + `GET /api/order-sources` (dropdown filter Source, vẫn đang dùng).
> Gộp 2 file wiki thành 1 file này, xoá `analytics-order-report.md`.

---

## 1. Đường dẫn & File

| | |
|---|---|
| Web | `/analytics/orders` — `web/src/app/(dashboard)/analytics/orders/page.tsx` |
| Redirect (URL cũ) | `/analytics/order-report` → `redirect("/analytics/orders")`, giữ lại tránh 404 cho ai bookmark |
| API dữ liệu chính | `GET /api/analytics/order-report` (list phân trang + `export=1` cho export) |
| API dữ liệu tham chiếu | `GET /api/staff` (dropdown PIC) · `GET /api/channels` (dropdown Channel) · `GET /api/order-sources` (dropdown Source) · `GET /api/analytics/quarterly-settings` (tier keywords, để tô badge Tier) |
| Nguồn | `fact_fulfillment_revenue`/`fact_sales_revenue` + `dim_staff` · `dim_customer` · `dim_sku` · `dim_order_source` |
| Quyền | key `orders` trong `analytics-roles.ts`; mặc định: `b2b`, `ops-&-cs`, `hr` (xem `DEFAULT_ROLE_PERMISSIONS`) |

## 2. Query chính (`/api/analytics/order-report`)

```sql
SELECT
  MIN(f.<dateCol>)::date AS order_date,
  TRIM(f.staff_code) AS staff_code,
  COALESCE(st.name, NULLIF(TRIM(f.staff_code), ''), 'Unassigned') AS staff_name,
  COALESCE(dc.name, TRIM(f.customer_code)) AS customer_name,
  TRIM(f.customer_code) AS customer_code,
  f.order_code,
  COALESCE(MAX(f.company_code), '') AS company_code,
  STRING_AGG(DISTINCT TRIM(f.sku), ', ' ORDER BY TRIM(f.sku)) AS order_name,
  STRING_AGG(DISTINCT COALESCE(sk.type_of_sim, 'Other'), ', ') AS sim_type,
  COALESCE(MAX(s.channel_name), '') AS channel_name,
  COALESCE(UPPER(MAX(s.group_name)), '') AS channel_group,
  SUM(<quantityCol>)::bigint AS quantity,
  ROUND(SUM(f.<revenueCol>)::numeric / NULLIF(SUM(<quantityCol>)::numeric, 0))::bigint AS unit_price,
  SUM(f.<revenueCol>)::bigint AS total_revenue,
  SUM(<gpCol>)::bigint AS gross_profit,
  MAX(dc.price_list_name) AS price_list_name
FROM <mainTable> f
LEFT JOIN dim_staff st ON TRIM(f.staff_code) = TRIM(st.code)
LEFT JOIN dim_customer dc ON TRIM(f.customer_code) = TRIM(dc.code::text)
LEFT JOIN (SELECT TRIM(sku) AS sku, MAX(type_of_sim) AS type_of_sim FROM dim_sku GROUP BY TRIM(sku)) sk
  ON TRIM(f.sku) = sk.sku
LEFT JOIN dim_order_source s ON f.order_source_code = s.code
WHERE <filters>
GROUP BY f.order_code, TRIM(f.staff_code), COALESCE(st.name, ...), COALESCE(dc.name, ...), TRIM(f.customer_code)
ORDER BY MIN(f.<dateCol>) DESC, f.order_code
LIMIT <limit> OFFSET <offset>
```

3 query chạy song song: `dataSQL` (bảng), `countSQL` (`COUNT(*)` bọc quanh `baseSelect`, dùng cho phân
trang) — **bỏ qua khi `export=1`** (loop nhiều trang tự biết hết khi trả về mảng rỗng, không cần đếm
trước), và `aggrSQL` (`SUM` toàn kỳ cho KPI card, cũng bỏ qua khi export vì không cần).

`dim_sku` join qua subquery dedupe `GROUP BY TRIM(sku)` — join thẳng sẽ fan-out nhân đôi doanh thu nếu có
mã trùng (case thật: `3ETWNWMF01010` từng trùng 2 dòng). `dim_customer.code` là kiểu `text` trong
gohub_dw hiện tại → luôn `TRIM(c.code::text)` khi so khớp.

## 3. Bộ lọc

- **Nguồn ngày** (`dataSource`): `fulfilled` (mặc định, `fact_fulfillment_revenue`/`fulfiled_date`, có GP)
  hoặc `created` (`fact_sales_revenue`/`created_date`, **không có `gross_profit_vnd`** → cột GP = 0).
- **Entity** (`companyCode`: rỗng=All/`VN`/`US`) — pill đầu Row 1, badge cột Entity trong bảng.
- **Ngày**: chế độ Single day (`date`, tương đương `startDate=endDate=date`) hoặc Date range
  (`startDate`+`endDate`), bắt buộc phải có 1 trong 2.
- **Group** (`channelGroup`: B2B/B2C) · **Channel** (`channel`, ưu tiên hơn `channelGroup` nếu cả 2 set) ·
  **Source** (`orderSource`, ưu tiên cao nhất trong 3 filter kênh) · **PIC** (`staffCode`).
- **2 field Yes/No (default No = loại, đúng chuẩn s132 chung toàn hệ thống)**:
  - **Include ShippingFee**: No → thêm `sku != 'SHIPPINGFEE0'`. Yes → giữ phí ship trong doanh thu.
  - **Include Internal Ops**: No → thêm `group_name != 'INTERNAL-TRANSACTION'` (loại đơn chuyển nội bộ,
    revenue=0 chỉ có COGS). Yes → giữ.
  - Đối chiếu T6/2026: cả 2 No = 8.978 tỷ · cả 2 Yes = 9.000 tỷ (30.570 dòng = bảng raw, dùng để validate).
- Loại nhiễu cố định trong SQL (không phải filter UI): không có — `staff_name != 'Auto ESIM'` đã bị bỏ ở
  route hiện tại (khác mô tả cũ của "Orders" phiên bản trước gộp; nếu Hiếu thấy dòng "Auto ESIM" xuất hiện
  lại, đây là điểm khác biệt cần biết khi so 2 route cũ).
- **Search** (client-side, chỉ lọc trong page hiện tại — theo `order_code`/`customer_name`/`staff_name`/
  `order_name`) — không gọi lại API.

## 4. KPI & số liệu (quan trọng)

- **Total Orders/Revenue/GP hiển thị = tổng TOÀN KỲ** (từ `totalRevenue`/`totalGp`/`totalQty` trong response
  API, tính bằng `aggrSQL` riêng trên toàn bộ kết quả filter — KHÔNG phải chỉ trang đang xem). Khi đang gõ
  Search (lọc client-side) → 3 số này đổi sang tổng của rows đang hiển thị + label "trong kết quả search".
- `Total Orders` đếm theo `order_code` distinct (route GROUP BY theo order_code), khác "số dòng" line-item
  gốc trong `fact_fulfillment_revenue` (1 đơn có thể nhiều dòng SKU).
- **Export**: loop fetch nhiều trang (`limit=5000`/lần, cap server-side) tới khi hết, gộp toàn bộ đơn rồi
  xuất 1 file Excel — KHÔNG chỉ xuất trang đang xem. `ORDER BY` có tiebreaker `order_code` để phân trang
  ổn định giữa các lần gọi loop (tránh trùng/sót dòng).

## 5. Gotchas

- 1 `order_code` có thể gồm nhiều SKU/dòng gốc — route `GROUP BY order_code` nên mỗi đơn ra đúng 1 row;
  cột `order_name`/`sim_type` gộp bằng `STRING_AGG(DISTINCT ...)`, có thể dài nếu đơn nhiều SKU (FE nên
  truncate hiển thị nếu cần, hiện chưa giới hạn độ dài).
- `dataSource=created` (`fact_sales_revenue`) không có `gross_profit_vnd` lẫn `fulfilled_quantity` →
  cột GP luôn 0, cột Quantity dùng `f.quantity` thay `f.fulfilled_quantity` (khác cột, không phải bug).
- Tier KH (badge cột cuối) tính **client-side** từ `price_list_name` + `tierKeywords`
  (`/api/analytics/quarterly-settings`, cùng nguồn Quarter Report) — không phải cột SQL trả sẵn.
- File wiki NÀY từng tồn tại song song với `analytics-order-report.md` mô tả 1 API khác (`/api/orders`)
  đã chết — nếu tìm thấy tài liệu/comment code cũ nhắc `/api/orders` (không phải `/api/orders/export`),
  đó là tàn dư trước lần gộp, không còn đúng.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Order Code | `fact_fulfillment_revenue.order_code` | 1 đơn có thể nhiều dòng (nhiều SKU); GROUP BY ra 1 row/đơn |
| Date | `fact_fulfillment_revenue.fulfiled_date` / `fact_sales_revenue.created_date` | Toggle qua `dataSource` |
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(...)` per order |
| Gross Profit | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(...)`; = 0 khi `dataSource=created` |
| Quantity | `fact_fulfillment_revenue.fulfilled_quantity` / `fact_sales_revenue.quantity` | Tên cột khác theo `dataSource` |
| PIC (Staff) | `dim_staff.name` | JOIN `TRIM(f.staff_code) = TRIM(dim_staff.code)` |
| Customer | `dim_customer.name` | JOIN `TRIM(f.customer_code) = TRIM(dim_customer.code::text)` |
| Product Type | `dim_sku.type_of_sim` | JOIN qua subquery dedupe `GROUP BY TRIM(sku)` (tránh fan-out) |
| Channel / Group | `dim_order_source.channel_name` / `group_name` | JOIN `f.order_source_code = dim_order_source.code` |
| Tier KH | `dim_customer.price_list_name` | Phân loại client-side theo `tierKeywords` (quarterly-settings) |
| Company Code | `fact_fulfillment_revenue.company_code` | VN / US / All filter |
