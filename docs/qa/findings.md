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
| **G2-7** | **P1** | B2C (tab Metric) | CM1 các tháng 1 đến 7 sai nặng: T4 −871 triệu, T5 −3,6 tỷ, T6 −1,8 tỷ, T7 −1,7 tỷ, trong khi tab Advanced cùng dữ liệu ra +1.050, +723, +873, +895 triệu. Tháng 8 đến 10 trùng nhau vì chưa nhập chi phí kênh khác | route `b2c/metric` cộng chi phí của TẤT CẢ kênh trong `analytics_channel_costs` (cả VN-Ecom, Traveloka, Momo, BIDV... là kênh B2B) và áp chi phí dạng phần trăm lên doanh thu B2C | ĐÃ SỬA (test sống đạt) |
| G2-6 | P2 | B2B (bản khoảng ngày) | Xuất Excel "B2B Tier Performance": cột CM1 và CM1 % bằng Gross Profit và Margin % (M Service JSC: CM1 240,2 triệu / 47,6% trong file, 109,4 triệu / 12,6% trên màn hình); "Projected CM1" bằng Projected GP; thiếu cột CH.Cost | `exportToExcel` dùng `d.gpm2` thay vì `d.cm1` và không có `ch_cost` (`b2b/page.tsx` ~780) | ĐÃ SỬA (chưa tải lại file xem) |
| G2-5 | P3 | B2B (VN Ecom) | "Orders" của `ecom-breakdown` và `ecom-timeline` đếm dòng chứ không đếm đơn: Q3 Shopee 6.321 dòng so với 5.966 đơn (+6%) | `COUNT(*)` thay vì `COUNT(DISTINCT order_code)` | ĐÃ SỬA (Q3 5.966 / 1.532 / 73 đúng SQL) |
| G2-8 | P3 | B2C | Tab Metric tính tháng hiện tại đến ngày 19/10 (doanh thu 1.068.201.394) còn Advanced và Performance dừng ở 18/10 (1.037.899.005) | mốc dữ liệu khác nhau giữa route | ĐÃ SỬA (test sống đạt) |
| G2-9 | P3 | B2C (Advanced) | Huy hiệu %MoM của tháng đang chạy so MTD với CẢ tháng trước (T10 ↓26,1%) trong khi thẻ trên cùng so đúng cùng kỳ (+13,6%) | huy hiệu dùng tháng đầy đủ | ĐÃ SỬA (chưa kiểm giao diện) |
| G2-10 | P3 | B2C | Khối Customer lấy từ API admin GoHub (T9: 1.211.078.432) lệch DW (1.403.609.143, −13,7%); trong Metric, Customer chỉ có 2 đến 3 khách vì DW gộp khách B2C vào vài mã khách vãng lai | nguồn ngoài, khác định nghĩa | ĐÃ SỬA (Metric lấy khách thật từ Admin GoHub như Advanced, ghi nguồn trên trang; test sống đạt) |
| G2-11 | P3 | B2C | Bộ lọc nâng cao: CM1 của lát cắt (vendor, kênh con) trừ TOÀN BỘ chi phí B2C của kỳ (vd Q T9, vendor 3HK: GP 483,5 triệu, CM1 351,2 triệu = trừ đủ 132,3 triệu); bộ lọc "Product type" gần như vô nghĩa (1.403.319.095 đ nằm ở "Unknown") | chi phí kênh/nhóm không phân bổ được theo vendor; `dim_sku.category_name` chưa nhập | NGHI |
| **G2-12** | P2 | Dashboard | Bảng Performance Summary chiếu tháng 10 với hệ số ×1,63 (31/19: tính theo hôm nay) trong khi thẻ Month-End Projection cùng trang dùng ×1,72 (31/18: ngày dữ liệu cuối); doanh thu chiếu 6,5 so 6,9 tỷ | `monthly-kpis` dùng `new Date()` thay vì endDate của khoảng đang xem | ĐÃ SỬA (test sống đạt) |
| **G2-13** | **P1** | Staff | Bấm mở một nhân viên: `staff-report/customers` hết 25 giây (HTTP 500 `Query read timeout`), giao diện hiện "Không có dữ liệu KH" không báo lỗi | `LEFT JOIN dim_sku` (kể cả gom nhẹ) kết hợp bộ lọc loại trừ làm planner chọn plan chậm; UI nuốt lỗi | ĐÃ SỬA (IN subquery 25s → 1,3s; UI báo lỗi; test sống đạt) |

## Bài học cho test tự động

- `test:consistency` hiện chạy biến thể loại ship/nội bộ (mặc định API). Cần thêm biến thể **giao diện mặc định (ship=1, nội bộ=1)** và kiểm `COGS = Revenue − Margin`, `Σ kênh = tổng` cả khi bật hộp tích.
- Cần thêm vòng quét mọi route với `dateColumn=created_date` (hoặc `dataSource=created`) và kiểm không 500.
- Cần thêm điều kiện `prevQuarterTotals.* = quarterTotal.* của quý liền trước`.
