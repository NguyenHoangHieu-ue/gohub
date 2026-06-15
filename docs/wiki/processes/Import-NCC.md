---
title: "Quy Trình Import NCC — Upload → Kiểm tra → Xác nhận"
page_type: process_sop
department: product
tags: [process, import, ncc, wm, 3hk, upload, diff]
aliases: ["Import NCC", "Upload NCC", "Cập nhật giá vendor"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# Quy Trình Import NCC

## Tổng Quan

Khi vendor (WM, 3HK...) gửi file báo giá mới, GoHub cần cập nhật vào hệ thống mà **không làm mất thông tin cũ** (APN, cấu hình mạng...) và **thấy rõ những gì thay đổi** trước khi xác nhận.

---

## Các Bước Thực Hiện

```
Vendor gửi file (Excel/CSV)
    │
    ▼
[1] Upload file tại web — SP Vendor
    │
    ▼
[2] Hệ thống phân tích + so sánh với dữ liệu hiện có
    → Hiện danh sách thay đổi chia 3 nhóm:
       🟢 Sản phẩm mới
       🟡 Giá thay đổi
       🔴 Ngưng cung cấp
    │
    ▼
[3] Xem lại → Xác nhận
    │
    ▼
[4] Cập nhật vào hệ thống + ghi lại lịch sử import
```

---

## Bước 1 — Chuẩn Bị File

### Các format được hỗ trợ

**WM Native Format (CSV/XLSX):**
Nhận dạng tự động bằng cột `wmproductId`.
Các cột: ID sản phẩm, tên, khu vực, loại, giá nhập, eSIM.

**GoHub Standard Format (XLSX):**
Sheet tên **"Goi co san"** (gói cố định) và/hoặc **"Datapool"** (giá/GB).
Template tải về tại: web **SP Vendor** → nút **"Tải template"**.

> Nếu vendor dùng format riêng → chuyển sang GoHub Standard trước khi import.

---

## Bước 2 — Upload và Xem Thay Đổi

1. Vào web **SP Vendor** → Tab WM (hoặc vendor tương ứng)
2. Click **"Import CSV"** *(chỉ hiện với Admin/Manager)*
3. Chọn file từ máy → hệ thống tự phân tích

**Danh sách thay đổi chia 3 nhóm:**

| Nhóm | Màu | Nghĩa |
|---|---|---|
| Sản phẩm mới | 🟢 Xanh | Có trong file nhưng chưa có trong hệ thống |
| Giá thay đổi | 🟡 Vàng | Giá nhập khác so với dữ liệu hiện tại |
| Ngưng cung cấp | 🔴 Đỏ | Có trong hệ thống nhưng không còn trong file mới |

Mỗi nhóm có thể mở/thu gọn, hiện tối đa 5 mẫu đầu.

---

## Bước 3 — Xác Nhận Import

- Xem lại danh sách → click **"Xác nhận Import"**
- Hệ thống cập nhật toàn bộ
- **Thông tin APN được giữ nguyên:** cấu hình mạng, nhà mạng... **không bị ghi đè** khi chỉ có giá thay đổi
- Lịch sử import được lưu lại (ngày giờ, số lượng dòng, trạng thái)

---

## Nhận Dạng Format Tự Động

```
File upload
    │
    ├─ Có cột "wmproductId"? ──────→ WM native
    │
    └─ Có sheet "Goi co san"
       hoặc cột "vendor_code"? ──→ GoHub Standard
```

---

## GoHub Standard Template

### Sheet "Goi co san" — gói cố định (WM, BC, SS...)

Các cột bắt buộc: `vendor_code`, `vendor_id`, `product_name`, `region`, `sim_type`, `days`, `data_gb`, `is_daily`, `is_unlimited`, `cost_price`, `currency`, `is_kyc`

Các cột tùy chọn: `throttle_mbps`, `apn`, `network_type`, `is_lesim`, `notes`

### Sheet "Datapool" — giá/GB (3HK...)

Các cột bắt buộc: `vendor_code`, `zone_id`, `zone_name`, `countries`, `sim_type`, `price_per_gb`, `currency`, `is_kyc`

Các cột tùy chọn: `network_type`, `notes`

---

## Một Số Lưu Ý

- **Kiểm tra trùng file:** Nếu file giống hệt lần trước → hệ thống cảnh báo "file không có thay đổi mới"
- **Không xóa dữ liệu cũ:** Sản phẩm "ngưng cung cấp" được đánh dấu, không xóa khỏi hệ thống
- **WM format cũ vẫn hoạt động:** Backward compatible, không cần chuyển đổi

---

## Liên Quan

- [[vendors/WM-WorldMove#Format File Báo Giá|WM — Format file]]
- [[vendors/3HK#Format File Báo Giá|3HK — Format file]]
- [[pricing/FX-Rates]] — tỷ giá khi tính giá nhập
