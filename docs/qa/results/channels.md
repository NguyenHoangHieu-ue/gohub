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
