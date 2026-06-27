# NCC Catalog (Danh Mục Nhà Cung Cấp)

Hệ thống quản lý catalog sản phẩm của Nhà Cung Cấp (NCC) lớn gồm WorldMove (WM) và 3HK, hỗ trợ so sánh khoảng trống danh mục và tạo sản phẩm hàng loạt.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/ncc` (`web/src/app/(dashboard)/ncc/page.tsx`)
- **API WorldMove**: `/api/ncc/worldmove` (`web/src/app/api/ncc/worldmove/route.ts`)
- **API 3HK**: `/api/ncc/3hk-zones` (`web/src/app/api/ncc/3hk-zones/route.ts`)
- **API Import Preview**: `/api/ncc/import-preview` (`web/src/app/api/ncc/import-preview/route.ts`)
- **API Import Confirm**: `/api/ncc/import-confirm` (`web/src/app/api/ncc/import-confirm/route.ts`)
- **API Sinh Template**: `/api/ncc/template` (`web/src/app/api/ncc/template/route.ts`)

---

## 2. Kiến Trúc Kỹ Thuật & Cơ Chế Khớp Nối (Gap Analysis)
- **Bảng `ncc_worldmove`**: Chứa hơn `8,921` dòng catalog sản phẩm của đối tác WorldMove. Toàn bộ thông số APN và trạng thái tồn tại (`exist = 'Yes' / 'No'`) được đồng bộ đầy đủ.
- **Bảng `ncc_3hk`**: Chứa thông tin cấu hình 45 Zones của nhà mạng 3HK.
- **Cơ chế so khớp địa danh (`nccCountryScore`)**:
  - Điểm số khớp: `3` (Trực tiếp), `2` (Khu vực - ví dụ: châu Âu khớp với các nước EU), `1` (Toàn cầu - Worldwide), `0` (Không khớp).
- **Gap Analysis**: Thuật toán tự động đối chiếu danh mục sản phẩm đang hoạt động của GoHub với catalog đối tác. Hệ thống phân lọc ra các sản phẩm tiềm năng có trạng thái `exist = No` (WM có bán nhưng GoHub chưa tạo SKU tương ứng) để đề xuất bổ sung sản phẩm mới.

---

## 3. Quy Trình Vận Hành & Nhập Hàng Hàng Loạt (Bulk Import)
Quy trình thêm nhanh sản phẩm từ catalog NCC vào hệ thống GoHub:

1. **Sinh Template (Tạo cấu hình)**:
   - Người dùng lựa chọn gói cước từ WM hoặc 3HK.
   - Trình duyệt hiển thị form cấu hình phân loại rõ: nhóm trường *Bắt buộc nhập thủ công* và nhóm trường *Tự động điền (Auto-fill)* để giảm thiểu sai sót do con người.
   - Hỗ trợ tùy chọn "Top-up SIM" cho 3HK: khi bật, hệ thống tự động sinh 2 dòng Excel tương ứng với eSIM (type C) và SIM vật lý (type E).
2. **Tải lên & Xem trước (Import Preview)**:
   - Người dùng tải tệp Excel cấu hình lên hệ thống.
   - API `/api/ncc/import-preview` thực hiện kiểm tra định dạng và hiển thị bảng xem trước lỗi/cảnh báo trực quan.
3. **Xác nhận lưu (Import Confirm)**:
   - Nhấn "Xác nhận", API `/api/ncc/import-confirm` sẽ ghi nhận hàng loạt bản ghi mới vào Supabase và kích hoạt trạng thái `exist = 'Yes'` cho sản phẩm NCC đó.

---

## 4. Phân Quyền
- **Standard**: Không có quyền truy cập trang này.
- **Staff**: Được phép xem catalog NCC và thực hiện phân tích Gap.
- **Manager / Admin / Creator**: Có toàn quyền vận hành quy trình Import, chỉnh sửa thông tin APN, xuất biểu mẫu và cấu hình tham số NCC.\n