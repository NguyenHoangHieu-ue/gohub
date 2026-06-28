# Staff Performance (Hiệu Suất Nhân Viên)

Bảng xếp hạng doanh thu & đơn xử lý của từng nhân viên kinh doanh nội bộ.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: đo hiệu quả từng nhân viên (doanh số, số đơn, lợi nhuận đóng góp) → đánh giá, thưởng/KPI.
- **Tại sao cần lọc đơn chưa gán**: lượng lớn đơn bán lẻ tự động không gắn NV → nếu tính chung sẽ bóp méo bảng xếp hạng.

## 2. Đường dẫn & file
- **Web**: `/analytics/staff` — `web/src/app/(dashboard)/analytics/staff/page.tsx`
- **API**: `/api/staff-list`, `/api/staff-performance`

## 3. Nguồn dữ liệu & chỉ số
- **Nguồn**: `fact_fulfillment_revenue` (`gohub_dw`) gán theo mã NV.
- **Revenue**: doanh số NV mang lại trong kỳ.
- **Orders**: số đơn hoàn tất gán cho NV.
- **Biên lợi nhuận đóng góp**: lợi nhuận sau trừ giá vốn.

## 4. Quy tắc xử lý đơn chưa gán (NaN)
- Có ~58,579 đơn (~11.77 tỷ VND) mang mã NV = `'NaN'` (đơn bán lẻ tự động chưa phân NV).
- Thay `'NaN'` → nhãn **"Chưa gán NV"/"Chưa xác định"** trên leaderboard để không hiện tên lỗi & không làm méo xếp hạng.

## 5. Phân quyền
- **Admin, Creator, Manager, BOD, Staff**. **Standard** bị chặn.
