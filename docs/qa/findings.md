# Bảng phát hiện tổng hợp (QA tab Analyst)

Cập nhật sau mỗi giai đoạn. Mức độ: P0 sai số tiền hoặc mất dữ liệu · P1 sai số ở trường hợp thường gặp, hoặc ghi bị 403 câm, hoặc lỗi 500 · P2 không nhất quán, dễ hiểu lầm, thiếu chức năng · P3 giao diện, nhãn, chênh làm tròn.
Chi tiết và bằng chứng nằm ở `results/<tab>.md`. Trạng thái: MỞ (chưa duyệt sửa) · DUYỆT · ĐÃ SỬA · NGHI (cần Hiếu xác nhận).

## G1 (2026-10-18): Quarter Report, BOD, Channels

| ID | Mức | Tab | Tóm tắt | Gốc | Trạng thái |
|---|---|---|---|---|---|
| **F-01** | **P1** | Channels, BOD, B2B, B2C, Dashboard (monthly-kpis) | Chế độ **Created** trả HTTP 500 (`syntax error at or near ".0"`) ở 13 route; giao diện BOD không báo lỗi và giữ số cũ | `SUM(f.${source.marginCol})` với `marginCol = "0"` trong 31 chỗ / 18 tệp | ĐÃ SỬA (chờ deploy + chạy test sống) |
| **Q-01** | **P1** | Quarter Report | %QoQ CM1 B2B dùng 3 cơ sở "quý trước" khác nhau trên một màn hình (Q3: −13,6% / −7% / +0,1%); Q4 so Q3 cơ sở lệch 919 triệu (28%) | `prevQuarterTotals.b2bCm1` chỉ trừ chi phí dạng amount của mọi KH | MỞ |
| **B-01** | **P1** | BOD | Total COGS, Units Sold, 3HK doanh thu không áp bộ lọc chuẩn nào; tắt Phí ship chỉ đổi Revenue và Margin | `fetchAggregates()` trong `bod-summary` thiếu `sfx` | MỞ |
| **B-02** | **P1** | BOD | Hộp tích "Đơn nội bộ" chỉ có tác dụng khi nhóm nội bộ có doanh thu > 0; Σ CM1 kênh ≠ thẻ CM1 (Q3 −36,78 triệu) | `finalizeGroupMargin` `.filter(g => g.revenue > 0)` | MỞ |
| B-04 | P1 | BOD | Created: 3/5 request 500, giao diện giữ số Fulfillment (hệ quả F-01 + nuốt lỗi) | như F-01 | MỞ |
| Q-02 | P2 | Quarter Report | "Tải lại mới" không làm mới lifecycle và target; "Xem báo cáo" chỉ tải lại báo cáo | `refreshAll` | MỞ |
| B-03 | P2 | BOD | Σ CM1 biểu đồ ngày ≠ thẻ CM1 (Q3 +2,9 triệu, T9 +0,69 triệu) | cách rải chi phí theo ngày | MỞ |
| B-05 | P2 | BOD | Thẻ "so với tháng trước" gọi tháng trước không kèm cờ ship/nội bộ | `bod/page.tsx` | MỞ |
| G0-1..4 | P2 | Dashboard, B2C, Channels, BOD, Customers, Products, Manage Costs | Nhiều route có cache nhưng không nhận `nocache=1` (gợi ý của bộ quét; chưa xác nhận từng route) | thiếu `noCache(req)` | NGHI |
| Q-03 | P3 | Quarter Report | ALL/VN/US đầu trang không đổi bảng B2B (có ô riêng) | thiết kế | MỞ |
| Q-04 | P3 | Quarter Report | Lifecycle 220 khách vs 222 ở bảng hạng; "mới 62" gồm 1 khách 0 doanh thu B2B; định nghĩa khách mới theo đơn đầu có doanh thu | `b2b_lifecycle` | NGHI |
| Q-05 | P3 | Quarter Report | Lệch 1 đồng (B2B + B2C đã làm tròn) so với Dashboard | làm tròn từng phần | MỞ |
| B-06 | P3 | BOD | `subChannels=Klook` ra 0 (khớp `sapo_name`) | `getBODFilters` | NGHI |
| Ch-02 | P3 | Channels | Hai dòng cùng tên "Misc." (B2B và B2C) | tên kênh trùng giữa hai nhóm | MỞ |

## Bài học cho test tự động

- `test:consistency` hiện chạy biến thể loại ship/nội bộ (mặc định API). Cần thêm biến thể **giao diện mặc định (ship=1, nội bộ=1)** và kiểm `COGS = Revenue − Margin`, `Σ kênh = tổng` cả khi bật hộp tích.
- Cần thêm vòng quét mọi route với `dateColumn=created_date` (hoặc `dataSource=created`) và kiểm không 500.
- Cần thêm điều kiện `prevQuarterTotals.* = quarterTotal.* của quý liền trước`.
