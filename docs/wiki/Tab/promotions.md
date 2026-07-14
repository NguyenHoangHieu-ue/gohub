---
title: "Promotions (Quản Lý Khuyến Mãi)"
page_type: tab_guide
department: product
tags: [tab, promotions]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# Promotions (Quản Lý Khuyến Mãi)

Trang hiển thị và quản lý các chiến dịch khuyến mãi, chính sách quà tặng và ưu đãi hiện hành của GoHub.

> **Mục đích & vai trò**: nơi quản lý ưu đãi gắn với SKU + làm nguồn để chatbot tự giới thiệu khuyến mãi cho khách. **Tại sao gắn `sku_codes`**: ưu đãi áp theo từng gói cụ thể → khi khách hỏi gói đó, agent `tu-van`/`giai-dap` đọc đúng ưu đãi đang chạy (theo `start_date`/`end_date`).

---

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/promotions` (`web/src/app/(dashboard)/promotions/page.tsx`)
- **API Frontend**: `/api/promotions` (`web/src/app/api/promotions/route.ts`)
- **API Admin**: `/api/admin/promotions` (`web/src/app/api/admin/promotions/route.ts`)

---

## 2. Thiết kế Kỹ Thuật & Schema
Dữ liệu lưu tại bảng `promotions` trong Supabase:
- `id`: Định danh UUID.
- `title`: Tiêu đề chương trình ưu đãi.
- `sku_codes`: Mảng mã SKU áp dụng ưu đãi này.
- `discount_value`: Giá trị chiết khấu hoặc mô tả quà tặng.
- `start_date` / `end_date`: Ngày bắt đầu và kết thúc chiến dịch (nếu để trống hiển thị mặc định `"-"`).
- `perks_vn` / `perks_en`: Chi tiết đặc quyền bằng tiếng Anh / tiếng Việt.

---

## 3. Quy trình Vận Hành
- **Hiển thị**: Hệ thống tự động kiểm tra thời gian hiện tại để hiển thị danh sách các chương trình khuyến mãi còn hiệu lực.
- **Admin Management**: Admin có thể thêm mới khuyến mãi, liên kết chương trình với danh sách mã SKU cụ thể, chỉnh sửa thời hạn áp dụng, hoặc xóa chương trình khi hết hạn.
- **Tích hợp Chatbot**: Agent `tu-van` và `giai-dap` tự động đọc thông tin khuyến mãi từ bảng để giới thiệu cho khách hàng khi họ hỏi về các chính sách ưu đãi hiện có của quốc gia/gói cước tương ứng.

---

## 4. Phân Quyền
- **Standard / Staff / BOD**: Chỉ xem danh sách khuyến mãi đang chạy.
- **Manager / Admin / Creator**: Có quyền quản lý hoàn toàn (thêm, sửa, xóa, liên kết SKU). Giao diện hiển thị thêm cột đếm số lượng SKU liên kết đối với tài khoản quản trị.\n