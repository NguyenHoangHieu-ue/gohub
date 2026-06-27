# Customer Performance (Hiệu Suất Khách Hàng B2B)

Báo cáo phân tích hành vi mua hàng, giá trị vòng đời và phân tầng các khách hàng sỉ B2B lớn của GoHub.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/analytics/customers` (`web/src/app/(dashboard)/analytics/customers/page.tsx`)
- **API Backend**: `/api/customers` (`web/src/app/api/customers/route.ts`)

---

## 2. Kỹ Thuật Phân Phối Dữ Liệu
- **Phân trang tối ưu (Pagination 20)**: Do tệp khách hàng sỉ của doanh nghiệp rất lớn, bảng danh sách khách hàng được cấu hình hiển thị chính xác `20 hàng trên một trang` kết hợp với thanh chuyển trang `pager.tsx` để giảm thời gian phản hồi máy chủ và tải giao diện nhẹ nhàng hơn.
- **Xử lý mã rác**: Lọc bỏ các bản ghi khách hàng mang mã `'NaN'` (chỉ có khoảng 13 đơn lẻ trong hệ thống) và hiển thị thành danh mục "Chưa xác định" để đảm bảo tính trong sạch của báo cáo.

---

## 3. Chỉ Số Phân Tích Khách Hàng
- **Lượng đơn mua hàng (Order Count)**: Đếm tổng số lần khách sỉ tạo đơn nhập hàng.
- **Doanh số cống hiến (Total Spent)**: Tổng dòng tiền ròng khách hàng thanh toán cho GoHub.
- **Tần suất đặt hàng (Frequency)**: Khoảng thời gian trung bình giữa các lần nhập hàng của đại lý.

---

## 4. Phân Quyền
- Kích hoạt truy cập cho: **Admin, Creator, BOD, Manager, Staff**.\n