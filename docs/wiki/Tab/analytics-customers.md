---
title: "Customer Performance (Hiệu Suất Khách Hàng B2B)"
page_type: tab_guide
department: all
tags: [tab, analytics, customers]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# Customer Performance (Hiệu Suất Khách Hàng B2B)

Phân tích hành vi mua, giá trị vòng đời và phân tầng khách hàng sỉ B2B lớn.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: nhận diện khách sỉ "VIP" (mua nhiều/đều), khách đang giảm mua → chăm sóc/giữ chân đúng đối tượng.
- **Tại sao tập trung B2B**: khách sỉ ít nhưng giá trị lớn, theo dõi cá nhân hoá được (khác B2C đại trà).

## 2. Đường dẫn & file
- **Web**: `/analytics/customers` — `web/src/app/(dashboard)/analytics/customers/page.tsx`
- **API**: `/api/customers`

## 3. Nguồn dữ liệu & chỉ số
- **Nguồn**: `gohub_dw` nhóm theo khách hàng sỉ.
- **Order Count**: số lần tạo đơn nhập.
- **Total Spent**: tổng tiền ròng khách trả.
- **Frequency**: khoảng thời gian trung bình giữa các lần mua → đo độ "đều".

## 4. Xử lý dữ liệu rác & hiệu năng
- **Mã `'NaN'`** (~13 bản ghi): gom thành "Chưa xác định" để báo cáo sạch.
- **Phân trang 20 dòng** (`pager.tsx`) vì tệp khách lớn.

## 5. Phân quyền
- **Admin, Creator, BOD, Manager, Staff**. **Standard** bị chặn (dữ liệu khách → bảo mật).
