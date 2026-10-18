# Bộ kỳ thử cố định (G0.4)

Mọi QA số liệu dùng các kỳ dưới đây để kết quả so được giữa các tab và giữa các phiên. Mốc "hôm nay" khi lập: 2026-10-18; dữ liệu fulfillment mới nhất 2026-10-17 (ETL chạy hằng giờ, ngày hôm nay luôn chưa đủ).

## Kỳ đã đóng (số không trôi)

| Mã | Khoảng | Mục đích |
|---|---|---|
| **Q3** | 2026-07-01 → 2026-09-30 | Quý đã đóng: Quarter Report, Squad Progress, All-Time, kênh có chi phí kênh tháng 7 |
| **T9** | 2026-09-01 → 2026-09-30 | Tháng đã đóng, không có chi phí kênh nhập |
| **T8** | 2026-08-01 → 2026-08-31 | Tháng đã đóng khác; INTERNAL-TRANSACTION GP −13,5 triệu |
| **T7** | 2026-07-01 → 2026-07-31 | Tháng có chi phí kênh (platformFee 2,46 tỷ) và KH loại trừ 161.000 đồng |
| **X-MONTH** | 2026-08-12 → 2026-09-09 | Khoảng vắt tháng (hai tháng, hai đầu lẻ) |
| **X-QUARTER** | 2026-06-15 → 2026-10-10 | Khoảng vắt quý |
| **ONE-DAY** | 2026-09-15 → 2026-09-15 | Một ngày đơn |
| **WEEK** | 2026-09-07 → 2026-09-13 | Tuần Thứ 2 → Chủ nhật đã đóng (Weekly Report) |
| **Q2** | 2026-04-01 → 2026-06-30 | Quý trước của Q3 (QoQ) |
| **Q3-PY** | 2025-07-01 → 2025-09-30 | Cùng kỳ năm trước (BOD previous_year) |

## Kỳ đang chạy (số nhích theo ngày; ghi mốc thời gian khi đo)

| Mã | Khoảng | Mục đích |
|---|---|---|
| **MTD** | 2026-10-01 → hôm qua | Pro-rata, projection, tháng đang chạy |
| **MTD-7** | 2026-10-01 → 2026-10-07 | Đúng ngưỡng 7 ngày của `MIN_PROJECT_DAYS` (kiểm chặn chiếu) |
| **Q4-QTD** | 2026-10-01 → hôm qua | Quý vừa bắt đầu: futureScale, quý có tháng tương lai |

## Kỳ biên

| Mã | Khoảng | Mong đợi |
|---|---|---|
| **EMPTY-PAST** | 2020-01-01 → 2020-01-31 | Không dữ liệu: trạng thái rỗng, không lỗi, không chia 0 |
| **FUTURE** | 2026-12-01 → 2026-12-31 | Tương lai: factor 1, trạng thái rỗng |
| **TODAY** | hôm nay → hôm nay | Bị cắt về `CURRENT_DATE - 1` |
| **REVERSED** | start > end | API hoặc giao diện xử lý được (không 500) |
| **Q4-DAY1** | 2026-10-01 → 2026-10-01 | Ngày đầu quý: `months` rỗng ở squad-progress (lỗi lịch sử 500) |

## Ma trận biến thể áp cho mỗi kỳ (khi tab có điều khiển tương ứng)

| Biến | Giá trị |
|---|---|
| Nguồn ngày | Fulfillment, Created |
| Thị trường | ALL, VN, US |
| Hộp tích (tổ hợp đủ 8 khi có cả ba) | Phí ship × Đơn nội bộ × Khách vận hành |
| So sánh | Không, kỳ trước, cùng kỳ năm trước |
| Nhóm kênh | All, B2B, B2C |
| Làm mới | bình thường, `nocache=1` ("Tải lại mới") |

Số tổ hợp đầy đủ rất lớn, nên mỗi tab chọn: (1) toàn bộ 8 tổ hợp hộp tích trên một kỳ đóng (Q3); (2) kỳ đóng còn lại ở tổ hợp mặc định giao diện và tổ hợp "sạch" (loại hết); (3) Created, VN, US trên một kỳ; (4) các kỳ biên. Danh sách chọn cụ thể ghi trong `results/<tab>.md`.
