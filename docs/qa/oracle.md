# Bộ đối chứng SQL độc lập (G0.3)

Mã: `web/scripts/qa/oracle.js`. SQL viết lại độc lập, KHÔNG dùng hàm lọc của hệ thống (`shipFilter`, `makeExcludeSql`...). Chạy qua `POST /api/analytics/query` trong tab đã đăng nhập (xem `README.md`).

## Cách gọi

```js
await QA.run("rev_by_group", { start: "2026-07-01", end: "2026-09-30" })
await QA.run("rev_by_channel", { start: "...", end: "...", ship: true, internal: true, ops: true, inactive: true, company: "VN", dateCol: "created_date" })
QA.sql("rev_total", { start: "...", end: "..." })     // chỉ xem câu SQL
```

Cờ lọc (mặc định = "doanh thu sản phẩm thuần"):

| Tham số | Ý nghĩa |
|---|---|
| `ship: true` | GỒM phí ship (`SHIPPINGFEE0`) |
| `internal: true` | GỒM nhóm INTERNAL-TRANSACTION |
| `ops: true` | GỒM khách trong danh sách loại trừ (đọc từ `/api/analytics/quarterly-settings`; chỉ loại trong nhóm B2B) |
| `inactive: true` | GỒM khách có `price_list_name` chứa INACTIVE |
| `company` | `VN` hoặc `US` (lọc `f.company_code`) |
| `dateCol` | `fulfiled_date` (mặc định) hoặc `created_date` (đổi bảng nguồn, GP = 0) |
| `anyGroup: true` | bỏ giới hạn `group_name IN ('B2B','B2C')` |

## Danh mục truy vấn

| Tên | Trả về | Dùng để đối chứng |
|---|---|---|
| `rev_total` | doanh thu, GP, units, orders của B2B+B2C | thẻ KPI tổng, Total của mọi tab |
| `rev_by_group` | theo `group_name` (kể cả INTERNAL-TRANSACTION nếu `internal`) | BOD Group Margin, Quarter B2B/B2C, b2b/kpis, b2c/kpis |
| `rev_by_channel` | theo kênh × nhóm | Channels bảng, BOD bảng kênh, Quarter B2C theo kênh |
| `rev_by_month_group` | theo tháng × nhóm | Quarter "Tổng hợp theo Tháng", All-Time, monthly-kpis |
| `rev_by_day` | theo ngày | biểu đồ ngày (BOD, Channels, Dashboard) |
| `hk3_by_group` | doanh thu và doanh thu 3HK theo nhóm | 3HK Contribution, 3HK% mọi tab |
| `rev_by_customer` | khách B2B: tên, price list, Organization, PIC, doanh thu, GP, 3HK | Quarter bảng khách, Customers, Squad Progress |
| `rev_by_customer_month` | khách × tháng | drill-down theo tháng, CH.Cost percent theo tháng thật |
| `rev_by_staff` | theo nhân viên (`sales_pic_code` rồi `staff_code`) | Staff |
| `rev_by_vendor` | theo vendor | Vendors |
| `rev_by_sku` | theo SKU (top N) | Products, Vendors bảng SKU |
| `rev_by_dest` | theo mã nước đích suy từ SKU | Products Region, Dashboard Region |
| `internal_group` | nhóm INTERNAL-TRANSACTION (doanh thu 0, GP âm) | giải thích chênh BOD và Channels |
| `ship_total` | riêng phí ship | giải thích chênh Dashboard và Channels |
| `raw_total` | không bộ lọc nào | Dashboard `kpis` (số thô) |
| `inactive_customers` | danh sách khách Inactive | kiểm bộ lọc Inactive |
| `excluded_revenue` | doanh thu của từng khách trong danh sách loại trừ | kiểm bộ lọc loại trừ (161.000 đồng ở T7) |
| `orders_count` | số đơn phân biệt, doanh thu, GP không lọc khách | Orders tổng |
| `b2b_first_order` | số khách B2B mới (đơn đầu tiên trong kỳ) và số khách hoạt động | lifecycle |
| `usage_bundles` | số SIM, usage, plan của 3HK trong kỳ | 3HK Data Usage (khớp NCC) |
| `usage_by_class` | như trên theo Daily, Fixed, Unlimited (ký tự thứ 8) | 3HK tab con |
| `usage_by_country_month` | TB theo nước × tháng | 3HK Zone × Tháng |
| `inventory_latest` | tồn theo SKU ở ngày chụp mới nhất | Inventory Tồn kho |
| `inventory_velocity` | số bán 30 ngày theo SKU | Inventory velocity |
| `latest_dates` | ngày dữ liệu mới nhất của từng fact | mốc cắt dữ liệu |

## Giá trị tham chiếu đã xác nhận (Q3 2026-07-01 → 2026-09-30, đo 2026-10-18)

| Truy vấn | Kết quả | Khớp với |
|---|---|---|
| `rev_total` (mặc định) | doanh thu 22.900.622.129,20 · GP 8.358.434.161,13 · 151.825 units · 84.271 đơn | Quarter Report, BOD `bod-group-margin`, Channels (sau s236) |
| `rev_by_group` | B2B 17.800.236.686,85 (GP 5.492.092.836,14; 73.119 đơn) · B2C 5.100.385.442,35 (GP 2.866.341.324,99; 11.152 đơn) | Quarter `quarterTotal.b2b`, `.b2c` |
| `raw_total` | 22.911.002.120,91 (88.609 dòng) | Dashboard `kpis` Total Revenue |
| `ship_total` | 10.218.991,71 | phần chênh Dashboard so với Channels |
| `internal_group` | doanh thu 0 · GP −36.783.894,33 (236 dòng) | nhóm nội bộ |
| `hk3_by_group` (B2B) | 3HK 12.282.399.285,08 | 3HK% B2B Q3 |

## Lưu ý

- Mọi truy vấn tính tổng công ty phải giữ `group_name IN ('B2B','B2C')` (mặc định đã có) để khớp quy ước của hệ thống.
- Đối chiếu số tiền bằng `QA.cmp(a, b, tol)`; tổng nguyên dùng `tol = 0`, số làm tròn `tol = 5`.
- Thời gian mỗi truy vấn đo được 2 đến 7 giây; 25 truy vấn chạy nền tuần tự mất khoảng 1,5 phút.
