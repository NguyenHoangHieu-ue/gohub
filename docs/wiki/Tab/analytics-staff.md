# Staff Performance (Hiệu Suất Nhân Viên)

Bảng xếp hạng hiệu quả doanh thu và tiến độ xử lý đơn hàng của từng nhân viên kinh doanh nội bộ.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/staff` (`web/src/app/(dashboard)/analytics/staff/page.tsx`)
- **API Staff List**: `/api/staff-list` (`web/src/app/api/staff-list/route.ts`)
- **API Staff Performance**: `/api/staff-performance` (`web/src/app/api/staff-performance/route.ts`)

---

## 2. Quy Tắc Nghiệp Vụ Xử Lý Đơn Chưa Gán (NaN Staff Code)
- Trong kho dữ liệu `fact_fulfillment_revenue` tồn tại một lượng đơn hàng rất lớn (~58,579 đơn hàng, tương đương giá trị gần 11.77 tỷ VND) mang mã định danh nhân viên là chuỗi ký tự `'NaN'`. Đây là các đơn hàng phát sinh tự động qua hệ thống bán lẻ trực tuyến chưa được phân phối cho nhân viên cụ thể chăm sóc.
- Để tránh việc dữ liệu hiển thị lỗi tên nhân viên là `"NaN"`, hệ thống áp dụng bộ lọc xử lý chuỗi:
  - Tự động thay thế mã nhân viên `'NaN'` thành nhãn hiển thị trực quan: **"Chưa gán NV"** hoặc **"Chưa xác định"** trên toàn bộ bảng xếp hạng Leaderboard và chi tiết hiệu suất.

---

## 3. Các Chỉ Số Đánh Giá
- **Doanh số tích lũy (Revenue)**: Tổng giá trị đơn hàng nhân viên mang lại trong kỳ báo cáo.
- **Số lượng đơn thành công (Orders)**: Tổng số giao dịch hoàn tất được gán cho nhân viên.
- **Biên lợi nhuận đóng góp**: Phần lợi nhuận thực tế mang lại sau khi trừ giá vốn sản phẩm.

---

## 4. Phân Quyền
- Vai trò xem: **Admin, Creator, Manager, BOD, Staff**.
- Standard user bị chặn hoàn toàn.\n