# Note (Cổng Thông Tin Hệ Thống — trước đây "Information")

Tab cung cấp dữ liệu tham khảo, tra cứu danh mục nhóm nước và quản lý tệp tin hướng dẫn vận hành nội bộ.

> **Mục đích & vai trò**: cổng thông tin chung cho mọi nhân viên — ghi chú vận hành nhanh + kho file template/hướng dẫn + tra danh mục nhóm nước. **Tại sao mọi role xem được**: là portal nội bộ phổ thông, không chứa số liệu nhạy cảm.
> **Đổi tên (s82)**: nhãn tab hiển thị đổi **"Information" → "Note"**. ⚠️ Tên BUCKET Supabase Storage vẫn giữ `"Information"` (đổi sẽ vỡ liên kết file đã lưu) — chỉ đổi nhãn UI.

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/info` (`web/src/app/(dashboard)/info/page.tsx`)
- **API Overview**: `/api/info/overview` (`web/src/app/api/info/overview/route.ts`)
- **API Notes**: `/api/info/notes` (`web/src/app/api/info/notes/route.ts`)
- **API Files**: `/api/info/files` (`web/src/app/api/info/files/route.ts`)

---

## 2. Kiến Trúc Kỹ Thuật & Phân Hệ Dữ Liệu
Trang bao gồm 3 phân hệ chính:
1. **Overview & Category**:
   - Tra cứu bảng `ref_categories` (Mã nhóm, tên VN/EN, mã nước ISO, loại Single-country hay Multi-country).
   - Tra cứu bảng `ref_support_countries` (Các quốc gia được hỗ trợ trên thực tế).
2. **Operating Notes (Ghi chú Vận hành)**:
   - Các ghi chú nhanh phục vụ công tác điều phối, cập nhật chính sách khẩn cấp. Lưu trữ và truy xuất từ Supabase.
3. **Reference Files (Tài liệu tham khảo)**:
   - Cho phép tải và đọc các file template nghiệp vụ chung của doanh nghiệp.

---

## 3. Phân Quyền
- Tab mang tính chất cổng thông tin nội bộ chung (Portal) nên **tất cả các vai trò (roles)** từ Standard đến Admin đều có quyền truy cập và đọc dữ liệu.
- Việc chỉnh sửa, cập nhật ghi chú hoặc tải lên tệp tin tham khảo mới bị giới hạn cho nhóm **Admin / Manager / Creator**.\n