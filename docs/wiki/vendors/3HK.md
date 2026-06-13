---
title: "Vendor — 3HK"
page_type: vendor_profile
department: product
tags: [vendor, 3hk, zone, pricing-per-gb, esim, sim]
aliases: ["3HK", "3 Hong Kong"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# 3HK (3 Hong Kong)

## Thông Tin Cơ Bản

| Thuộc tính | Giá trị |
|---|---|
| Mã vendor | `3H` |
| Loại báo giá | **Giá theo GB** (Datapool) — không phải gói cố định |
| Tổng zones trong DB | **45 zones** |
| Bảng DB | `ncc_3hk` (trước), `ncc_datapool` (v8 chuẩn mới) |
| KYC | Tùy zone |

---

## Mô Hình Giá (Datapool)

3HK **không** cung cấp gói cố định như WM.  
Thay vào đó, mỗi zone có **giá/GB** — GoHub tự tạo gói từ giá này.

### Bảng Giá Theo Zone (HKD/GB)

| Zone | Nước bao gồm | Giá |
|---|---|---|
| Châu Á (12 nước chính) | Japan, Korea, Singapore, Thailand, Malaysia, HK, TW, Indonesia, Philippines, Vietnam, Cambodia, Laos | **5 HKD/GB** |
| Châu Âu + Mỹ | UK, Germany, France, Italy, Spain, USA... | **7 HKD/GB** |
| Australia + New Zealand | AU, NZ | **6.5 HKD/GB** |

> Tỷ giá quy đổi: [[pricing/FX-Rates]]

---

## Công Thức Tính COGS

3HK dùng **dung lượng thực tế tiêu thụ** (không phải gói danh nghĩa) để tính giá.

> Chi tiết đầy đủ: [[pricing/3HK-COGS-Formula]]

**Tóm tắt nhanh:**

| Loại gói | Dung lượng tính | Hệ số |
|---|---|---|
| Fixed Data | GB danh nghĩa × 55% | 0.55 |
| Daily Data | GB/ngày × số ngày × 40% | 0.40 |
| Unlimited 10 Mbps | 1.8 GB/ngày × số ngày | 100% |
| Unlimited 5 Mbps | 1.6 GB/ngày × số ngày | 100% |

---

## Cấu Trúc File Báo Giá (GoHub Standard)

**Sheet "Datapool"** trong GoHub NCC Standard Template:

| Cột | Bắt buộc | Mô tả |
|---|---|---|
| `vendor_code` | ✅ | `3H` |
| `zone_id` | ✅ | ID zone (unique) |
| `zone_name` | ✅ | Tên zone |
| `countries` | ✅ | Danh sách nước trong zone |
| `sim_type` | ✅ | `SIM` hoặc `eSIM` |
| `price_per_gb` | ✅ | Giá/GB |
| `currency` | ✅ | `HKD` |
| `network_type` | — | `4G/LTE`, `5G` |
| `is_kyc` | ✅ | `true`/`false` |
| `notes` | — | Ghi chú |

---

## Lưu Ý Quan Trọng

> **3HK chỉ là tham khảo** — không phải sản phẩm GoHub đang bán.  
> Chatbot chỉ thông báo: Zone/network/giá HKD/GB/KYC.  
> **Không tự tính gói cước từ formula** — đó là việc của Hiếu/team product.

### Khi nào dùng 3HK?
- Khách hàng cần đi nước mà WM không có (hoặc giá WM không cạnh tranh)
- Team cần reference để tạo sản phẩm mới → dùng 3HK zone + formula

> Vendor priority: [[pricing/Vendor-Priority]]
