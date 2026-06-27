# 3HK Data Usage (Theo Dõi Tiêu Hao Data 3HK)

Trang số liệu theo dõi chi tiết dung lượng tiêu thụ thực tế của người dùng sử dụng các gói eSIM/SIM thuộc Zone của nhà mạng đối tác 3HK.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/3hk-usage` (`web/src/app/(dashboard)/analytics/3hk-usage/page.tsx`)
- **API Backend**: `/api/analytics/3hk-usage/report` (`web/src/app/api/analytics/3hk-usage/report/route.ts`)

---

## 2. Kỹ Thuật Truy Vấn & Bảo Mật
- **Kết nối kho dữ liệu**: API truy vấn trực tiếp vào bảng số liệu lớn `fact_data_usage` của `gohub_dw` để lấy lưu lượng tiêu hao thực tế.
- **Vệ sinh câu lệnh (SQL Sanitization)**: Áp dụng các bộ lọc nội suy trực tiếp để đảm bảo quá trình gọi API lọc theo quốc gia hoặc khoảng thời gian không bị lạm dụng chèn mã độc.
- **Phân trang**: Giới hạn phân trang tối đa `20 hàng/bảng` để giảm thiểu áp lực băng thông máy chủ khi tải lượng bản ghi dữ liệu cực lớn.

---

## 3. Nghiệp Vụ Báo Cáo
- Thống kê tổng lượng data sử dụng (theo GB/TB) theo từng Zone du lịch của 3HK.
- Đối chiếu lượng data thực tế tiêu thụ với lưu lượng gói cước định mức đã bán để phát hiện các trường hợp nghẽn mạng hoặc người dùng lạm dụng băng thông quá mức cho phép.

---

## 4. Phân Quyền
- Cho phép xem đối với: **Admin, Creator, Manager, BOD, Staff**.\n