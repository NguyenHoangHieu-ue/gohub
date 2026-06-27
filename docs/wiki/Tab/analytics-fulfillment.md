# Fulfillment Report (Báo Cáo Hoàn Thành Đơn Hàng)

Báo cáo phân tích hiệu suất và chất lượng vận hành kỹ thuật của quy trình cấp phát SIM/eSIM tự động đến tay người dùng.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/fulfillment` (`web/src/app/(dashboard)/analytics/fulfillment/page.tsx`)
- **API Backend**: `/api/analytics/fulfillment-report` (`web/src/app/api/analytics/fulfillment-report/route.ts`)

---

## 2. Cơ Chế Vận Hành & Khai Thác Dữ Liệu
Báo cáo kết nối trực tiếp đến bảng dữ liệu vận hành đơn của kho dữ liệu `gohub_dw` để trích xuất các chỉ số:
- **Tỉ lệ cấp phát thành công (Success Rate)**: Số lượng mã eSIM/SIM vật lý được gửi đến người dùng thành công trên tổng lượng đơn thanh toán.
- **Thời gian hoàn thành đơn trung bình (Mean Fulfillment Time)**: Đo lường tốc độ cấp phát tự động của hệ thống từ lúc nhận đơn cho tới khi kích hoạt sim thành công.
- **Chi tiết phân bổ đối tác vận chuyển**: Phân tích hiệu quả phân phát thẻ SIM vật lý của từng đơn vị giao hàng.

---

## 3. Phân Quyền
- Được truy cập đối với các vai trò: **Admin, Creator, Manager, BOD, Staff**.
- Standard user bị loại trừ khỏi phạm vi cấp quyền xem trang này.\n