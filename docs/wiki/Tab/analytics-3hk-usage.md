# 3HK Data Usage (Theo Dõi Tiêu Hao Data 3HK)

Trang số liệu theo dõi chi tiết dung lượng tiêu thụ thực tế của người dùng sử dụng các gói eSIM/SIM thuộc Zone của nhà mạng đối tác 3HK.

> **Mục đích & vai trò**: 3HK là dòng sản phẩm chiến lược (2 key metric của team Business: CM1 + 3HK Contribution %). Trang này đối chiếu **data thực tế tiêu thụ** vs **định mức gói đã bán** để (1) phát hiện lạm dụng băng thông/nghẽn, (2) kiểm chứng giả định dung lượng khi định giá gói Unlimited. **Tại sao phức tạp**: gói Unlimited 3HK thực chất là "fixed high-speed + throttle" với 3 biến thể (500MB/1GB × 5/10mbps), mã cũ↔mới khác nhau → phải mapping kỹ (mục 5).

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
- Tính SERVER-side ở **`/api/analytics/3hk-speed-map`**. **CHỈ 3 loại** tồn tại: `500MB·5mbps`, `500MB·10mbps`, `1GB·10mbps`. KHÔNG tự thêm loại khác.
- **Quy tắc mapping mã (theo nghiệp vụ):**
  - Mã CŨ usage: `[E]<nước:3><3D><P1|P2><ngày>D` (E=eSIM, không=SIM). **P1 = 10 mbps, P2 = 5 mbps.**
  - Mã MỚI product DB: `<prefix><nước:3><3D><A|B>UNL<ngày>`. **A = 5 mbps, B = 10 mbps** (P1↔B, P2↔A).
  - **P2 (5 mbps) → LUÔN 500MB** (chỉ 1 loại 5mbps).
  - **P1 (10 mbps) → 1GB hay 500MB**: map sang mã mới theo (nước, ngày, 10mbps) — tìm cả tenant **VN & US** — lấy **giá `latest_cogs`/ngày** so ngưỡng (trung điểm median 1GB vs 500MB ≈ 41k VND/ngày từ product DB) → dự đoán. Thiếu giá → nhãn `throttle_speed`; thiếu cả → mặc định 500MB.
- KHÔNG dùng `offer_name` (join theo iccid → SIM dùng nhiều gói dễ lẫn offer gói khác, vd "Fixed 3GB" → phân loại sai).
- Mỗi nhóm có nút **"Chi tiết (n)"** → bung danh sách SKU (SKU, Active SIMs, Plan/Actual GB, Usage %, **Nguồn phân loại** = price/label/default/rule-5mbps) để kiểm tra.
- Thực tế data: ~15 SKU ra **1GB·10mbps** (chủ yếu **EU + USA** — thị trường premium giá cao); còn lại 500MB.
- ⚠️ Vendor 3HK trong `dim_sku` = `'3HK DATAPOOL'` (CÓ dấu cách) → mọi SQL lọc bằng `REPLACE(UPPER(vendor),' ','')='3HKDATAPOOL'`. Default ngày = đầu-tháng(MAX data)..MAX (data 3HK chậm sync, hiện đến 30/05).
