---
title: "Vendor Performance (Hiệu Suất Nhà Cung Cấp)"
page_type: tab_guide
department: all
tags: [tab, analytics, vendors]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# Vendor Performance (Hiệu Suất Nhà Cung Cấp)

Báo cáo chi tiêu mua hàng, chất lượng mạng và mức đóng góp doanh thu của từng nhà cung cấp (NCC) đối tác.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: đánh giá NCC nào đáng tin (chi phí, chất lượng mạng, thị phần đơn) → quyết định ưu tiên nhập hàng/đàm phán giá.
- **Tại sao cần**: GoHub bán SIM/eSIM của nhiều NCC (WORLDMOVE, 3HK...); cần so sánh để chọn nguồn tối ưu.

## 2. Đường dẫn & file
- **Web**: `/analytics/vendors` — `web/src/app/(dashboard)/analytics/vendors/page.tsx`
- **API**: `/api/analytics/vendors/list`, `/api/analytics/vendors/report`

## 3. Nguồn dữ liệu & chỉ số
- **Nguồn**: `gohub_dw` nhóm theo vendor (lưu ý vendor 3HK = `'3HK DATAPOOL'` có dấu cách → chuẩn hoá khi lọc).
- **Total COGS spent**: tổng tiền nhập hàng trả NCC trong kỳ.
- **Success/Failure Rate**: tỷ lệ eSIM/mạng lỗi → chất lượng hạ tầng NCC.
- **Volume Share %**: tỷ trọng đơn của NCC trong tổng đơn GoHub.

## 4. Vấn đề đã gặp & UX
- **Dropdown chọn vendor bị treo (S61)**: thêm overlay trong suốt → click ra ngoài tự đóng menu.
- **Bug Vendor Performance (S78)**: đã fix (số liệu hiệu suất tính sai).
- **Phân trang 20 dòng** để phản hồi nhanh; trang fan-out nhiều query → hưởng cache 12h chung.

## 5. Phân quyền
- **Admin, Creator, Manager, BOD, Staff**. **Standard** bị chặn.
