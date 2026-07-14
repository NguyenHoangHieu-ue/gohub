---
title: "Orders Management (Quản Lý Đơn Hàng BI)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, orders]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# Orders Management (Quản Lý Đơn Hàng BI)

Trình duyệt danh sách đơn hàng lấy trực tiếp từ kho dữ liệu, hỗ trợ tìm kiếm nâng cao + xuất Excel để đối soát.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: tra cứu/đối soát đơn hàng chi tiết (theo mã đơn, SKU, khách, kênh, nhân viên) và xuất file cho kế toán.
- **Tại sao tách khỏi báo cáo tổng**: đây là dữ liệu **dòng** (raw rows) để tra cứu, khác các tab BI tổng hợp số liệu.

## 2. Đường dẫn & file
- **Web**: `/analytics/orders` — `web/src/app/(dashboard)/analytics/orders/page.tsx`
- **API**: `/api/orders` (danh sách), `/api/orders/export` (xuất XLSX)

## 3. Nguồn dữ liệu & kỹ thuật
- **Đơn hàng**: `gohub_dw` (fact đơn). Truy vấn trực tiếp (không cache nặng vì cần dữ liệu tươi + có filter động).
- **Chống SQL Injection**: ô nhập ngày/company qua `safeDate()` + `safeCompanyCode()` làm sạch trước khi vào WHERE. **Tại sao**: filter người dùng nhập tự do → phải sanitize để tránh chèn mã.
- **Phân trang**: mặc định **20 dòng/trang** (`pager.tsx`) vì bảng đơn rất lớn.

## 4. Tính năng vận hành
- **Tìm kiếm nâng cao**: lọc theo Mã đơn / SKU / Tên khách / Kênh / Mã NV.
- **Export XLSX**: xuất danh sách đã lọc ra Excel để đối soát kế toán.

## 5. Phân quyền
- **Admin, Creator, BOD, Manager, Staff**. **Standard** bị chặn (đơn chứa thông tin khách → bảo mật).
