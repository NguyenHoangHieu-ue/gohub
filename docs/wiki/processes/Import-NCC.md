---
title: "Quy Trình Import NCC — Upload → Diff → Confirm"
page_type: process_sop
department: product
tags: [process, import, ncc, wm, 3hk, upload, diff]
aliases: ["Import NCC", "Upload NCC", "Cập nhật giá vendor"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# Quy Trình Import NCC

## Tổng Quan

Khi vendor (WM, 3HK...) gửi file báo giá mới → GoHub cần cập nhật vào DB mà **không mất dữ liệu** (APN, network info...) và **thấy rõ những gì thay đổi** trước khi confirm.

---

## Luồng Xử Lý (Web UI)

```
Vendor gửi file (Excel/CSV)
    │
    ▼
[1] Upload file tại web /ncc
    │
    ▼
[2] API parse + so sánh với DB
    → Hiện diff 3 nhóm:
       🟢 Sản phẩm mới
       🟡 Giá thay đổi  
       🔴 Ngưng cung cấp
    │
    ▼
[3] Review → Confirm
    │
    ▼
[4] Upsert vào DB + log vào data_file_registry
```

---

## Bước 1 — Chuẩn Bị File

### Format được hỗ trợ

**WM Native Format (CSV/XLSX):**
- Có cột `wmproductId` → tự động nhận dạng
- Cột: wmproductId, product name, region, type, cost price NT, leSIM

**GoHub Standard Format (XLSX):**
- Sheet tên **"Goi co san"** (gói cố định) và/hoặc **"Datapool"** (giá/GB)
- Có cột `vendor_code`
- Template tải về tại: web `/ncc` → nút **"Tải template"**

> Nếu vendor dùng format riêng → chuyển sang GoHub Standard trước khi import.

---

## Bước 2 — Upload và Xem Diff

1. Vào web `/ncc` → **Tab WM** (hoặc vendor tương ứng)
2. Click nút **"Import CSV"** (chỉ hiện với admin/manager)
3. Chọn file từ máy → hệ thống tự parse

**Diff được hiển thị theo 3 nhóm:**

| Nhóm | Màu | Nghĩa |
|---|---|---|
| Sản phẩm mới | 🟢 Xanh | vendor_product_id có trong file nhưng không có trong DB |
| Giá thay đổi | 🟡 Vàng | COGS khác nhau giữa file và DB |
| Ngưng cung cấp | 🔴 Đỏ | status=active trong DB nhưng không có trong file |

Mỗi nhóm collapsible, hiện tối đa 5 mẫu đầu.

---

## Bước 3 — Confirm Import

- Review diff → click **"Xác nhận Import"**
- Hệ thống upsert toàn bộ vào DB
- **Bảo toàn APN data:** các cột apn, network_type, providers... **không bị overwrite** khi chỉ có giá thay đổi
- Log vào `data_file_registry`: last_imported, row_count, sha256, status=ok

---

## Auto-Detect Format

```
File upload
    │
    ├─ Có cột "wmproductId"? ──────→ WM native parser
    │
    └─ Có sheet "Goi co san"
       hoặc cột "vendor_code"? ──→ GoHub Standard parser
```

---

## GoHub Standard Template

### Sheet "Goi co san" — gói cố định (WM, BC, SS...)

Các cột bắt buộc: `vendor_code`, `vendor_id`, `product_name`, `region`, `sim_type`, `days`, `data_gb`, `is_daily`, `is_unlimited`, `cost_price`, `currency`, `is_kyc`

Các cột tùy chọn: `throttle_mbps`, `apn`, `network_type`, `is_lesim`, `notes`

### Sheet "Datapool" — giá/GB (3HK, ...)

Các cột bắt buộc: `vendor_code`, `zone_id`, `zone_name`, `countries`, `sim_type`, `price_per_gb`, `currency`, `is_kyc`

Các cột tùy chọn: `network_type`, `notes`

---

## Backward Compatibility

- **WM native CSV** (format cũ từ trước session 43) vẫn hoạt động
- Hệ thống auto-detect → không cần migration file cũ

---

## Lưu Ý Kỹ Thuật

- **SHA-256 hash checking:** File trùng hash với lần import trước → cảnh báo "file không thay đổi"
- **Upsert không xóa:** Sản phẩm "ngưng cung cấp" được mark `status=inactive`, không xóa khỏi DB
- **Re-embed sau import:** Cần trigger re-embed các SKU bị ảnh hưởng (TODO: Phase 5 pending)

---

## Liên Quan

- [[vendors/WM-WorldMove#Cấu Trúc File Báo Giá (WM Native Format)|WM file format]]
- [[vendors/3HK#Cấu Trúc File Báo Giá (GoHub Standard)|3HK standard format]]
- [[pricing/FX-Rates]] — tỷ giá khi tính COGS
