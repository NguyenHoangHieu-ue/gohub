---
title: "Order Report"
page_type: tab_guide
is_hidden: true
---

# Tab: Order Report (`/analytics/order-report`)

## Mục đích
Bảng chi tiết đơn hàng theo từng đơn — xem + export. Phục vụ tracking bán hàng theo ngày, PIC, khách hàng, loại sản phẩm.

## Đường dẫn & File

| Loại | Đường dẫn |
|------|-----------|
| Page | `web/src/app/(dashboard)/analytics/order-report/page.tsx` |
| API  | `web/src/app/api/analytics/order-report/route.ts` |
| Nav  | `web/src/lib/nav.ts` → Sales Performance (sau Staff) |
| Sidebar | `web/src/components/sidebar.tsx` (giữ đồng bộ với nav.ts) |
| Roles | `web/src/lib/analytics-roles.ts` → key `"order-report"` |

## Luồng dữ liệu

```
FE (page.tsx)
  → GET /api/analytics/order-report?startDate=&endDate=&[filters...]
  → route.ts: analyticsGuard → queryAnalytics(gohub_dw)
     - SQL: GROUP BY order_code
     - JOIN dim_staff (PIC name)
     - JOIN dim_customer (customer name, price_list_name)
     - JOIN dim_sku (type_of_sim)
     - JOIN dim_order_source (channel / group_name)
  → Trả { rows: OrderRow[], total, page, limit }
  → FE render bảng paginated + export button
```

## Columns hiển thị

| Cột FE | Nguồn DB | Ghi chú |
|--------|----------|---------|
| Ngày | `MIN(f.fulfiled_date)` hoặc `MIN(f.created_date)` | Toggle theo dataSource |
| PIC | `dim_staff.name` / `f.staff_code` | |
| Tên đơn hàng | `STRING_AGG(DISTINCT f.sku)` | List SKU trong đơn — fact table không có order_name |
| Khách hàng | `dim_customer.name` | |
| Mã Đơn Hàng | `f.order_code` | |
| Loại HH | `dim_sku.type_of_sim` (eSIM / SIM) | |
| Số lượng | `SUM(f.fulfilled_quantity)` | |
| Đơn giá | `total_revenue / quantity` | Trung bình nếu đơn có nhiều SKU |
| Tổng tiền | `SUM(f.fulfilled_revenue_amount_vnd)` | |
| CM1/GP | `SUM(f.gross_profit_vnd)` | = GP (Gross Profit). Op cost không phân bổ được xuống cấp đơn. |
| Tier KH | phân loại từ `dim_customer.price_list_name` | Dùng tierKeywords từ quarterly-settings |

## Nguồn dữ liệu

- **Mặc định**: `fact_fulfillment_revenue` (ngày giao, có `gross_profit_vnd`)
- **Toggle "Ngày tạo đơn"**: `fact_sales_revenue` (ngày tạo, KHÔNG có gross_profit → CM1/GP = 0)

Lý do: `fact_sales_revenue` không có `gross_profit_vnd` nên khi chọn "Ngày tạo đơn", cột CM1/GP sẽ hiện 0.

## Phân quyền

- **admin, creator, bod**: xem tất cả (ALL_ANALYTICS_IDS)
- **b2b**: có `"order-report"` trong default permissions
- **hr**: có `"order-report"` trong default permissions
- Các role khác (b2c, saleb2c, ops-&-cs, product): cần admin cấp thêm qua Users

## Filters

| Filter | Query param | Ghi chú |
|--------|-------------|---------|
| Khoảng thời gian | `startDate`, `endDate` | Bắt buộc |
| PIC (sales) | `staffCode` | Staff code từ dim_staff |
| Nhóm kênh | `channelGroup` | B2B / B2C |
| Kênh | `channel` | channel_name từ dim_order_source |
| Company | `companyCode` | Mặc định ALL |
| Nguồn ngày | `dataSource` | `fulfilled` (mặc định) / `created` |
| Tìm kiếm | client-side | Lọc order_code, customer_name, staff_name, order_name |

## Pagination

- Mặc định: 50 đơn/trang
- Tổng số đơn = đếm bằng COUNT(*) chạy song song với query data
- Export: fetch lại toàn bộ (tối đa 5000 đơn) với `?export=1`

## Export

File Excel `.xlsx` gồm các cột:
`Ngày | PIC | Tên đơn hàng | Khách hàng | Mã Đơn Hàng | Loại Hàng Hóa | Số lượng | Đơn giá (VND) | Tổng tiền (VND) | CM1/GP (VND) | Tier KH`

Tier KH được tính client-side từ `price_list_name` + `tierKeywords` (giống Staff tab).

## Tier classification

Dùng `tierKeywords` từ `/api/analytics/quarterly-settings`:
- `null` price_list_name → **B2C**
- Match keyword Strategic/VIP/Gold/Silver → tier tương ứng
- Không match → **Strategic** (mặc định B2B)

## Gotcha & lưu ý

1. `fact_sales_revenue` không có `gross_profit_vnd` → khi `dataSource=created`, CM1/GP = 0 là đúng.
2. `fulfilled_quantity` chỉ có trong `fact_fulfillment_revenue`. Khi `dataSource=created`, quantity = NULL → hiển thị `—`.
3. `STRING_AGG(DISTINCT sku)` có thể dài nếu đơn có nhiều SKU → FE truncate với `max-w-[200px] truncate`.
4. Count query (`COUNT(*) FROM subquery`) không chạy khi `export=1` → tổng = số rows trả về.
5. `dim_customer.code` là `text` trong gohub_dw mới → cần `TRIM(dc.code::text)` để match.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Date | `fact_fulfillment_revenue.fulfiled_date` / `fact_sales_revenue.created_date` | Toggle: Fulfillment (mặc định) / Created |
| Revenue | `fact_fulfillment_revenue.fulfilled_revenue_amount_vnd` | `SUM(fulfilled_revenue_amount_vnd)` GROUP BY order_code |
| CM1 / GP | `fact_fulfillment_revenue.gross_profit_vnd` | `SUM(gross_profit_vnd)` = GP. Op cost không phân bổ được xuống cấp đơn |
| Quantity | `fact_fulfillment_revenue.fulfilled_quantity` | `SUM(fulfilled_quantity)` — NULL khi Created mode |
| PIC (Staff) | `dim_staff.name` | JOIN `TRIM(f.staff_code) = TRIM(dim_staff.code)` |
| Customer | `dim_customer.name` | JOIN `TRIM(f.customer_code) = TRIM(dim_customer.code)` |
| Tier KH | `dim_customer.price_list_name` | Phân loại từ `tierKeywords` (quarterly-settings): B2C / Strategic / VIP / Gold / Silver |
| SKU list | `fact_fulfillment_revenue.sku` | `STRING_AGG(DISTINCT sku)` — nhiều SKU trong 1 đơn |
| Product Type | `dim_sku.type_of_sim` | JOIN `f.sku = dim_sku.sku`; eSIM / SIM |
| Channel | `dim_order_source.channel_name` | JOIN `f.order_source_code = dim_order_source.code` |
| Group (B2B/B2C) | `dim_order_source.group_name` | Filter B2B / B2C |
