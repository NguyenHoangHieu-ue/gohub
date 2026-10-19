# Kết quả QA: Channels

- Ngày QA: 2026-10-18 · staging · commit `f4ee3187` · Claude
- Kiểm kê gốc: `../inventory/channels.md` · `../queries/channels.md`
- Kỳ thử: Q3, T9, X-MONTH (Fulfillment), Q3 Created
- **Đã làm:** số liệu 3 route chính (`performance`, `kpis`, `trend`), nhóm B2B/B2C, từng kênh đơn lẻ, Created. **Chưa làm:** giao diện (Overview và Single Channel: từng điều khiển, bảng sub-channel, Top Products, Daily Details, lọc vendor/loại sản phẩm phía trình duyệt), `channels/b2b-customers`, xuất file, dự phóng CM1 từng dòng.
- Số phép tự động: **929** (+ 4 kênh đơn lẻ so với bảng); lệch số liệu thật: 0. Phát hiện: 1 P1, 1 P3.

## A. Đã đạt

| Nhóm kiểm | Kết quả |
|---|---|
| `channels/performance`: từng kênh × (doanh thu, margin, units, orders, `prev_revenue`, %MoM, margin%, CM1%) so với SQL độc lập; Σ kênh = tổng | ĐẠT Q3, T9, X-MONTH |
| `channels/kpis`: doanh thu, margin, units, orders; CM1 = Σ CM1 bảng; CM1 = margin − `total_op_cost` | ĐẠT |
| `channels/kpis?channelGroup=B2B/B2C`: doanh thu, margin, CM1 = Σ CM1 nhóm tương ứng | ĐẠT Q3, T9 |
| `channels/kpis?channel=<kênh>` cho 8 kênh lớn: doanh thu và CM1 = dòng của bảng | ĐẠT (VN-Wholesales, Momo, VN-Ecom, Shopeepay …) |
| `channels/trend`: từng ngày doanh thu và margin; Σ ngày = tổng | ĐẠT |

## Phát hiện

| # | Mức | Mô tả | Bằng chứng | Nguyên nhân gốc | Đề xuất |
|---|---|---|---|---|---|
| **F-01** | **P1** | **Chế độ Created làm hỏng gần như mọi tab tài chính: HTTP 500 `syntax error at or near ".0"`.** Gồm `channels/performance`, `channels/kpis`, `channels/trend`, `bod-summary`, `bod-group-margin`, `bod-channel-performance`, `monthly-kpis`, `b2b/kpis`, `b2b/performance`, `b2b/trend`, `b2c/kpis`, `b2c/performance`, `b2c/trend`. Trên giao diện BOD, bật Created không báo lỗi mà giữ số cũ (xem B-04). Wiki ghi "Created → margin = 0", nhưng thực tế là lỗi 500. | Quét 31 route với `dateColumn=created_date`: 13 route 500; các route còn lại 200 (`kpis`, `revenue-chart`, `region-chart`, `performance-*`, `recent-orders`, `bod-report`, `b2b/strategic-performance`, `b2b/tier-performance`, `staff-report`, `all-time-performance`, `order-report`, `targets-summary`, quarterly và squad) | `getAnalyticsSource("created_date")` trả `marginCol: "0"`; 31 chỗ trong 18 tệp viết `SUM(f.${source.marginCol})` → `SUM(f.0)`. Có từ commit port BOD (2026-06-23). | Sửa một chỗ: cho `getAnalyticsSource` trả bảng bao `(SELECT s.*, 0::numeric AS gross_profit_vnd, 0::numeric AS cogs_amount_vnd FROM fact_sales_revenue s)` và tên cột thật; thêm test chạy mọi route với `dateColumn=created_date` và kiểm 200. |
| Ch-02 | P3 | Hai dòng cùng tên "Misc." trong bảng (một thuộc B2B: 5 đơn, doanh thu 0, GP −532.669; một thuộc B2C: 2.717 đơn, doanh thu 1,30 tỷ). Click tên kênh chuyển sang Single Channel theo tên nên khó phân biệt; điều kiện kênh theo `channel_name` gộp cả hai nhóm. | `channels/performance` Q3 | Tên kênh trùng giữa hai nhóm trong `dim_order_source` | Gắn nhóm vào tên hiển thị hoặc khoá theo `(channel, group)`. |

## Ghi chú

- Phép đối chiếu theo cặp `(kênh, nhóm)`; lần chạy đầu em khớp theo tên kênh nên báo lệch giả ở "Misc." — đã loại trừ, không phải lỗi sản phẩm.
- Sau s236 các cặp thẻ KPI = Σ bảng = BOD (tổ hợp loại ship, loại nội bộ) vẫn đạt; riêng tổ hợp BOD "gồm nội bộ" xem B-02.

## Bổ sung giao diện (2026-10-19, Chrome, staging, Creator)

| Hạng mục | Kết quả |
|---|---|
| Bảng All Channels Overview (kỳ 01–18/10, mặc định giao diện): 22 dòng × doanh thu, GP, margin%, CM1, CM1%, orders, units | ĐẠT, 0 lệch so với `channels/performance` |
| Cột MoM: giá trị tuyệt đối đúng; dấu nằm ở mũi tên | ĐẠT |
| `prev_revenue` từng kênh (22) so với SQL kỳ trước (13–30/09) | ĐẠT |
| Single Channel VN-Wholesales: thẻ KPI (doanh thu, GP, CM1, orders, units) = `channels/kpis` = dòng bảng | ĐẠT |
| Bảng Sub-channel: 2 dòng + Total = kênh (296 đơn, 4.029 units, 543,9 tr); Dự phóng = × 31/18; Contribution 76,0% + 24,0% | ĐẠT |
| Daily Performance Details: 18 ngày, Σ doanh thu, đơn, units = kênh | ĐẠT |
| Top Selling Products: 10 SKU (đơn, units, doanh thu, GP) so với SQL | ĐẠT, khớp từng đồng |
| Thẻ Month-End Projection: đơn 510, units 6.939, AOV (× 31/18) | ĐẠT |
| Chế độ Created trên giao diện: 3 bảng + `channels/kpis` đều 200, GP và CM1 = 0, có cảnh báo "orders created but not yet fulfilled" | ĐẠT (sau sửa F-01) |
| Trang này không có hộp tích Phí ship / Đơn nội bộ (API mặc định loại cả hai) | ghi nhận, khác các tab BOD, Quarter Report |

Chưa làm: lọc Vendor, Sub Channels, Product Type bằng thao tác thật; xuất 3 bảng; chọn Prev Period / Prev Year (chọn bằng mã không kích hoạt tải lại).

## Bổ sung giao diện lần 2 (2026-10-19)

| Hạng mục | Kết quả |
|---|---|
| Single Channel VN-Wholesales + Vendor "3HK DATAPOOL": bảng Sub-channel Total (250 đơn, 3.268 units, 437.384.858 đ, GP 97.190.070 đ) so với SQL độc lập | ĐẠT |
| So sánh Prev Period sau Apply Filters: doanh thu +14%, đơn +15% so với SQL kỳ trước (13–30/09: 217 đơn, 384.200.700 đ) | ĐẠT |

### Phát hiện mới (Channels)

| # | Mức | Mô tả | Bằng chứng | Nguyên nhân gốc | Đề xuất |
|---|---|---|---|---|---|
| **Ch-03** | **P2** | **Vendors, Product Type và Sub Channels không có tác dụng ở chế độ All Channels (Overview):** chọn vendor "3HK DATAPOOL" rồi Apply, bảng và TOTAL giữ nguyên (4.007.872.234 đ, 17.034 đơn) | Request `channels/performance` chỉ gửi `startDate`, `endDate`, `dateColumn`, không gửi bộ lọc | Bộ lọc chỉ áp dụng trong truy vấn của chế độ một kênh (`page.tsx` khoảng dòng 507); route `channels/performance` không đọc `vendors`, `productTypes` | Cho route nhận `getBODFilters` như BOD, hoặc ẩn các bộ lọc ở Overview |
| **Ch-04** | **P2** | **Chế độ một kênh: chọn Vendor hoặc Product Type thì "Top Selling Products" trống ("No product data available for this period")** dù kênh có doanh thu (VN-Wholesales + 3HK DATAPOOL: 437 triệu) | SQL top products trả lỗi HTTP 400 `column reference "sku" is ambiguous`, giao diện nuốt lỗi | `vendorFilter` và `productTypeFilter` viết `TRIM(sku)` không tiền tố, trong khi truy vấn top products JOIN `dim_sku sk` (cả hai bảng đều có `sku`) | Qualify `TRIM(${mt}.sku)` riêng cho truy vấn top products; hiện lỗi thay vì "No product data" |
| Ch-05 | P3 | Đổi ô "Compare" (nằm ngoài panel Filters) không tải lại: các thẻ hiện "So sánh +0%" và chú giải CURRENT/PREVIOUS cho tới khi bấm Apply Filters | Chọn Prev Period, chờ 20 giây: +0% ở cả 6 thẻ; sau Apply: +14%, +56%, +56%, +15%, +26%, −1% | Chọn so sánh không kích hoạt tải lại | Tải lại khi đổi ô Compare, hoặc đưa ô vào panel |
