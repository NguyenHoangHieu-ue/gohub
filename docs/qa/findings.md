# Bảng phát hiện tổng hợp (QA tab Analyst)

Cập nhật sau mỗi giai đoạn. Mức độ: P0 sai số tiền hoặc mất dữ liệu · P1 sai số ở trường hợp thường gặp, hoặc ghi bị 403 câm, hoặc lỗi 500 · P2 không nhất quán, dễ hiểu lầm, thiếu chức năng · P3 giao diện, nhãn, chênh làm tròn.
Chi tiết và bằng chứng nằm ở `results/<tab>.md`. Trạng thái: MỞ (chưa duyệt sửa) · DUYỆT · ĐÃ SỬA · NGHI (cần Hiếu xác nhận).

## G1 (2026-10-18): Quarter Report, BOD, Channels

| ID | Mức | Tab | Tóm tắt | Gốc | Trạng thái |
|---|---|---|---|---|---|
| **F-01** | **P1** | Channels, BOD, B2B, B2C, Dashboard (monthly-kpis) | Chế độ **Created** trả HTTP 500 (`syntax error at or near ".0"`) ở 13 route; giao diện BOD không báo lỗi và giữ số cũ | `SUM(f.${source.marginCol})` với `marginCol = "0"` trong 31 chỗ / 18 tệp | ĐÃ SỬA (test sống đạt) |
| **Q-01** | **P1** | Quarter Report | %QoQ CM1 B2B dùng 3 cơ sở "quý trước" khác nhau trên một màn hình (Q3: −13,6% / −7% / +0,1%); Q4 so Q3 cơ sở lệch 919 triệu (28%) | `prevQuarterTotals.b2bCm1` chỉ trừ chi phí dạng amount của mọi KH | ĐÃ SỬA (test sống đạt) |
| **B-01** | **P1** | BOD | Total COGS, Units Sold, 3HK doanh thu không áp bộ lọc chuẩn nào; tắt Phí ship chỉ đổi Revenue và Margin | `fetchAggregates()` trong `bod-summary` thiếu `sfx` | ĐÃ SỬA (test sống đạt) |
| **B-02** | **P1** | BOD | Hộp tích "Đơn nội bộ" chỉ có tác dụng khi nhóm nội bộ có doanh thu > 0; Σ CM1 kênh ≠ thẻ CM1 (Q3 −36,78 triệu) | `finalizeGroupMargin` `.filter(g => g.revenue > 0)` | ĐÃ SỬA (test sống đạt) |
| B-04 | P1 | BOD | Created: 3/5 request 500, giao diện giữ số Fulfillment (hệ quả F-01 + nuốt lỗi) | như F-01 | ĐÃ SỬA do F-01 (UI còn nuốt lỗi) |
| Q-02 | P2 | Quarter Report | "Tải lại mới" không làm mới lifecycle và target; "Xem báo cáo" chỉ tải lại báo cáo | `refreshAll` | ĐÃ SỬA (test sống đạt; Q-02, B-05 chưa kiểm trình duyệt) |
| B-03 | P2 | BOD | Σ CM1 biểu đồ ngày ≠ thẻ CM1 (Q3 +2,9 triệu, T9 +0,69 triệu) | cách rải chi phí theo ngày | ĐÃ SỬA (test sống đạt; Q-02, B-05 chưa kiểm trình duyệt) |
| B-05 | P2 | BOD | Thẻ "so với tháng trước" gọi tháng trước không kèm cờ ship/nội bộ | `bod/page.tsx` | ĐÃ SỬA (test sống đạt; Q-02, B-05 chưa kiểm trình duyệt) |
| G0-1..4 | P2 | Dashboard, B2C, Channels, BOD, Customers, Products, Manage Costs | Nhiều route có cache nhưng không nhận `nocache=1` (gợi ý của bộ quét; chưa xác nhận từng route) | thiếu `noCache(req)` | NGHI |
| **B-07** | **P1** | BOD | Tải nguội: `bod-summary` hết 25 giây (HTTP 500 `Query read timeout`), giao diện hiện toàn 0 không báo lỗi | `bod-summary` và `bod-group-margin` cùng quét nặng, pool gohub_dw 3 kết nối | ĐÃ SỬA (chia sẻ quét 3 kỳ, `lite`, UI thử lại + báo lỗi) |
| B-08 | P3 | BOD | Dòng "Other" có Margin % −1465,0% (doanh thu nhỏ) | hiển thị | MỞ |
| **Ch-03** | P2 | Channels | Vendors / Product Type / Sub Channels không có tác dụng ở chế độ Overview (bảng và TOTAL không đổi) | `channels/performance` không nhận bộ lọc | ĐÃ SỬA (kiểm sống) |
| **Ch-04** | P2 | Channels | Một kênh + Vendor hoặc Product Type: Top Selling Products trống (SQL `sku` ambiguous, UI nuốt lỗi) | `TRIM(sku)` không tiền tố khi JOIN `dim_sku` | ĐÃ SỬA (kiểm sống) |
| Ch-05 | P3 | Channels | Đổi ô Compare không tải lại, thẻ hiện "+0%" tới khi Apply | chọn so sánh không kích hoạt tải | MỞ |
| Q-06 | P3 | Quarter Report | Xuất Excel Squad: cột Leader là mã Lark thô | thiếu tra tên | MỞ |
| B2B-4 | P3 | B2B (view tháng) | Thẻ tổng luôn là ALL, không đổi theo ALL/VN/US của bảng hạng | thiết kế | MỞ |
| B2B-5 | P3 | B2B (view tháng) | Modal Sửa chi phí khách hiện cả 3 tháng của quý | dùng chung component quý | MỞ |
| G2-1 | P3 | Dashboard | Tổng doanh thu Dashboard hơn All-Time và Staff đúng phần nhóm INTERNAL-TRANSACTION (401.585 đ ở 01–18/10), chưa có chú thích | số thô theo thiết kế | MỞ |
| G2-2 | P3 | Dashboard | region-chart chỉ 15 nước, không gom "Khác" | giới hạn 15 | MỞ |
| Q-03 | P3 | Quarter Report | ALL/VN/US đầu trang không đổi bảng B2B (có ô riêng) | thiết kế | MỞ |
| Q-04 | P3 | Quarter Report | Lifecycle 220 khách vs 222 ở bảng hạng; "mới 62" gồm 1 khách 0 doanh thu B2B; định nghĩa khách mới theo đơn đầu có doanh thu | `b2b_lifecycle` | NGHI |
| Q-05 | P3 | Quarter Report | Lệch 1 đồng (B2B + B2C đã làm tròn) so với Dashboard | làm tròn từng phần | MỞ |
| B-06 | P3 | BOD | `subChannels=Klook` ra 0 (khớp `sapo_name`) | `getBODFilters` | NGHI |
| Ch-02 | P3 | Channels | Hai dòng cùng tên "Misc." (B2B và B2C) | tên kênh trùng giữa hai nhóm | MỞ |

## Bài học cho test tự động

- `test:consistency` hiện chạy biến thể loại ship/nội bộ (mặc định API). Cần thêm biến thể **giao diện mặc định (ship=1, nội bộ=1)** và kiểm `COGS = Revenue − Margin`, `Σ kênh = tổng` cả khi bật hộp tích.
- Cần thêm vòng quét mọi route với `dateColumn=created_date` (hoặc `dataSource=created`) và kiểm không 500.
- Cần thêm điều kiện `prevQuarterTotals.* = quarterTotal.* của quý liền trước`.
