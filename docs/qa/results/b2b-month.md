# Kết quả QA: B2B Performance — view theo tháng (s236)

- Ngày QA: 2026-10-19 · staging · Chrome, Creator · commit `70db90d5`
- Phạm vi: toggle "Theo tháng" của `/analytics/b2b` (`b2b-month-view.tsx` + `B2BTierSection` với `fixedMonth`). Bản "Khoảng ngày (cũ)" chỉ kiểm mở được.

## Đã đạt

| Hạng mục | Kết quả |
|---|---|
| Σ các hạng (tier) của tháng = dòng B2B của `quarterly-report` (revenue, GM, CM1 + Group Cost, 3HK): 10 tháng 2026 × 2 tổ hợp hộp tích (ship/nội bộ tích hoặc bỏ) | ĐẠT, 0 lệch (Group Cost B2B cả 10 tháng = 0, nên phép CM1 trừ Group Cost chưa được thử với số khác 0) |
| T9 (đã đóng): thẻ, 4 hạng, 14 KH Strategic từng ô (revenue, GM, ch.cost, CM1, %MoM) so với API | ĐẠT |
| T10 (đang chạy): thẻ PR 5.114.287.826, CM1 952.784.589 = bản cũ "Full Period Forecast"; tổng 4 hạng = thẻ | ĐẠT |
| Tháng đầu quý (T7: so với T6 của quý trước; T1/2026: so với T12/2025 của quý trước năm) | ĐẠT: MoM thẻ −11,6% (T7), −26,7% (T1); MoM hạng Strategic dùng `prevMonthRevenue` (T12/2025: 7.345.981.417 khớp báo cáo Q4/2025) |
| Region ALL/VN/US ở bảng hạng (T9): VN + US = ALL, mọi ô khớp `byRegion` | ĐẠT |
| Organization (T10): dòng Organization = Σ mã con (Vũ Đình Khải: 142.571.756 + 14.351.622 = 156.923.378); %MoM Organization +90,3% = Σ tháng này / Σ tháng trước | ĐẠT |
| Cột bảng khách ở view tháng: không có %Tgt CM1, 3HK Rev TGT, %TGT 3HK; %QoQ thay bằng %MoM; nút T/Cả Quý ẩn | ĐẠT |
| Xuất Excel `b2b_thang_2026-09_ALL.xlsx`: 227 dòng (4 hạng + 222 KH), chỉ cột tháng + %MoM; revenue, CM1, %MoM từng dòng so với API | ĐẠT (sau sửa) |
| Chế độ Sửa chi tiết: bật được, 22 nút sửa chi phí hiện, mở modal, Xong và Hủy thoát sạch (không lưu gì) | ĐẠT |
| Tháng tương lai (2027-01): không lỗi, hiện "Chưa có dữ liệu B2B cho kỳ này" | ĐẠT |

## Đã sửa trong lúc QA

| # | Mô tả | Sửa |
|---|---|---|
| B2B-1 | Xuất file view tháng vẫn kèm cột Tổng Quý và %QoQ | `exportMonthTable` chỉ cột tháng + %MoM |
| B2B-2 | T1/2026 thẻ CM1 hiện "+23,7 đ.%" vì tháng trước (12/2025) không có lãi gộp | không so điểm % khi tháng trước `gp = 0` |
| B2B-3 | Nút T10/T11/T12/Cả Quý không ẩn (class `flex` đè `hidden`) | dùng `cn(... "hidden" : "flex")` |

## Còn mở (P3)

| # | Mô tả |
|---|---|
| B2B-4 | Thẻ tổng luôn là ALL, không đổi theo ALL/VN/US của bảng bên dưới (chưa có nhãn "ALL") |
| B2B-5 | Modal Sửa chi phí khách ở view tháng hiện cả 3 tháng của quý (T10, T11, T12), có thể gây hiểu nhầm là đang sửa riêng một tháng |
| B2B-6 | Phần "Khoảng ngày (cũ)" và VN Ecom Breakdown chưa QA lại sau khi thêm toggle (chỉ kiểm mở được) |

Chưa làm: lưu thật chi phí / Import (thao tác ghi, thuộc G6), Template download, so sánh với `b2b/ecom`.
