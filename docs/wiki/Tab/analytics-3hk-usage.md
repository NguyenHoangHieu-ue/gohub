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
- Cho phép xem đối với: **Admin, Creator, Manager, BOD, Staff** (và ops-&-cs, product theo `DEFAULT_ROLE_PERMISSIONS`).
- Data các bảng lấy qua `/api/analytics/query` (SELECT-only). Allow-list role của endpoint này **phải gồm `creator`** — nếu thiếu, creator vào được trang nhưng bảng rỗng (403 âm thầm).

---

## 5. Logic Bundle (Lọc theo kỳ) & Nhóm Tốc Độ Unlimited

### 5.1 Lọc theo Bundle (KHÔNG SUM thô)
- Đơn vị thống kê = **Bundle** = mỗi cặp `(iccid, order_code)` duy nhất.
- Cột lọc khoảng ngày = `MIN(first_report_date)` của Bundle (= `bundle_start_date`). **KHÔNG** dùng `activation_date` (chỉ hiển thị).
- Bundle có `bundle_start_date` trong `[startDate, endDate]` → cộng **toàn bộ lifetime** (`SUM(total_data_gb)`, capacity = `MAX(data_amount_gb)`), kể cả tiêu dùng sau khoảng ngày. Bundle bắt đầu trước khoảng ngày → bị loại hoàn toàn.

### 5.2 Nhóm tốc độ (high-speed × throttle) — tab Unlimited
- Tính SERVER-side ở **`/api/analytics/3hk-speed-map`** (`web/src/app/api/analytics/3hk-speed-map/route.ts`), trả map `usageSku → { group }`.
- Thứ tự suy nhóm: **(1)** `throttle_speed` của product DB (Supabase `skus`/`items`, bắc cầu mã cũ↔mới qua `alias`/`vendor_sku`) → **(2)** `offer_name` (`data_usage_log`) → **(3)** giá `latest_cogs` (cohort theo throttle+số ngày, đoán 500MB vs 1GB) → **(4)** ký tự SKU.
- **Throttle từ ký tự SKU (mã cũ): `P1 = 10 mbps`, `P2 = 5 mbps`** (theo offer_name + dung lượng thực; định nghĩa cũ trong code bị đảo, đã sửa).
- Nhãn nhóm giữ format: `"500MB high-speed · throttle 5 mbps"`, `"1GB high-speed · throttle 10 mbps"`...
