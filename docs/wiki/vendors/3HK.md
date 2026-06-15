---
title: "Vendor — 3HK"
page_type: vendor_profile
department: product
tags: [vendor, 3hk, zone, pricing-per-gb, esim, sim]
aliases: ["3HK", "3 Hong Kong"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# 3HK (3 Hong Kong)

## Thông Tin Cơ Bản

| Thuộc tính | Giá trị |
|---|---|
| Mã vendor | `3H` |
| Loại báo giá | **Giá theo GB**, phân theo vùng địa lý |
| Tổng số vùng | **45 vùng** |
| KYC | Tùy vùng |

---

## Mô Hình Giá (Giá theo GB)

3HK **không** cung cấp gói cố định như WM. Thay vào đó, mỗi vùng có **giá/GB** — GoHub tự tạo gói theo nhu cầu từ mức giá này.

### Giá Theo Vùng (HKD/GB)

| Vùng | Các nước chính | Giá |
|---|---|---|
| Châu Á (12 nước chính) | Nhật, Hàn, Singapore, Thái, Malaysia, HK, Đài Loan, Indonesia, Philippines, Việt Nam, Cambodia, Lào | **5 HKD/GB** |
| Châu Âu + Mỹ | Anh, Đức, Pháp, Ý, Tây Ban Nha, USA... | **7 HKD/GB** |
| Úc + New Zealand | AU, NZ | **6.5 HKD/GB** |

> Tỷ giá quy đổi: [[pricing/FX-Rates]]

---

## Tính COGS

3HK dùng **dung lượng thực tế tiêu thụ** (không phải gói danh nghĩa) để tính giá — vì người dùng thường không dùng hết 100%.

> Công thức chi tiết: [[pricing/3HK-COGS-Formula]]

**Tóm tắt nhanh:**

| Loại gói | Cách tính GB thực | Hệ số |
|---|---|---|
| Fixed Data | GB gói × 55% | 0.55 |
| Daily Data | GB/ngày × số ngày × 40% | 0.40 |
| Unlimited 10 Mbps | 1.8 GB/ngày × số ngày | 100% |
| Unlimited 5 Mbps | 1.6 GB/ngày × số ngày | 100% |

---

## Format File Báo Giá (GoHub Standard)

**Sheet "Datapool"** trong GoHub NCC Standard Template:

| Cột | Bắt buộc | Mô tả |
|---|---|---|
| `vendor_code` | ✅ | `3H` |
| `zone_id` | ✅ | ID vùng (duy nhất) |
| `zone_name` | ✅ | Tên vùng |
| `countries` | ✅ | Danh sách nước trong vùng |
| `sim_type` | ✅ | `SIM` hoặc `eSIM` |
| `price_per_gb` | ✅ | Giá/GB |
| `currency` | ✅ | `HKD` |
| `network_type` | — | `4G/LTE`, `5G` |
| `is_kyc` | ✅ | `true` / `false` |
| `notes` | — | Ghi chú |

---

## Lưu Ý Quan Trọng

> **3HK chỉ là tham khảo** — không phải sản phẩm GoHub đang bán trực tiếp.
> Chatbot chỉ thông báo: vùng phủ sóng / giá HKD/GB / yêu cầu KYC.
> **Không tự tính gói cước từ công thức** — đó là việc của team product.

### Khi nào dùng 3HK?
- Khách cần nước mà WM không có (hoặc giá WM không cạnh tranh)
- Team cần tham khảo để tạo sản phẩm mới → dùng zone 3HK + công thức tính COGS

> Ưu tiên vendor: [[pricing/Vendor-Priority]]
