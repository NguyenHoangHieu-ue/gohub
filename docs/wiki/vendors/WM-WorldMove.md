---
title: "Vendor — WorldMove (WM)"
page_type: vendor_profile
department: product
tags: [vendor, worldmove, wm, apn, esim, sim]
aliases: ["WorldMove", "WM", "WORLDMOVE"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# WorldMove (WM)

## Thông Tin Cơ Bản

| Thuộc tính | Giá trị |
|---|---|
| Mã vendor | `WM` |
| Ký tự vendor trong SKU (pos 6-7) | `WM` |
| Loại báo giá | Gói cố định (fixed catalog) |
| Tổng sản phẩm trong DB | **8,921 sản phẩm** |
| KYC yêu cầu | Không (is_kyc = No) |
| leSIM hỗ trợ | Có (is_lesim = Yes/No per gói) |

---

## Loại Gói (Product Types)

### 1. Titanium AYCE (All You Can Eat)
- **Data:** Không giới hạn tốc độ (truly unlimited)
- **Throttle:** `NULL` — không bị giới hạn tốc độ
- **Data Policy Code:** `D` (unlimited, no throttle)

### 2. Premium Unlimited
- **Data:** Unlimited với highspeed cap **1 GB/ngày**
- **Sau cap:** Throttle xuống **10 Mbps**
- **Data Policy Code:** `A` (daily cap → unlimited 10Mbps)

### 3. Standard Unlimited
- **Data:** Unlimited với highspeed cap **2 GB/ngày**
- **Sau cap:** Throttle xuống **5 Mbps**
- **Data Policy Code:** `B` (daily cap → unlimited 5Mbps)

### 4. Fixed Data
- **Data:** Tổng cố định (ví dụ 5GB, 10GB)
- **Throttle sau hết data:** **128 kbps** (browsing nhẹ)
- **Data Policy Code:** `F` hoặc `P`

### 5. Daily Data
- **Data:** Cấp theo ngày (ví dụ 1GB/ngày)
- **Throttle sau hết quota ngày:** **128 kbps**
- **Data Policy Code:** `P`

> Mapping đầy đủ: [[products/Data-Policy-Codes]]

---

## APN Information

APN (Access Point Name) là cấu hình mạng cần thiết để thiết bị kết nối internet.

### Format Hiển Thị trong Hệ Thống

```
Vietnam (Mobifone, Viettel, Vinaphone)
```
— tức là: **Tên vùng/nước (Danh sách nhà mạng)**

### Các Trường APN trong DB (`ncc_worldmove`)

| Cột | Mô tả |
|---|---|
| `apn` | Chuỗi APN (ví dụ: `m-wap`, `v-internet`) |
| `network_type` | Loại mạng (`4G/LTE`, `5G`) |
| `onsite_carrier` | Nhà mạng chính |
| `providers` | Danh sách nhà mạng hỗ trợ (nhiều dòng) |
| `coverage` | Vùng phủ sóng |
| `data_reset` | Giờ reset data hàng ngày |
| `notification` | Thông báo gửi khi hết quota |
| `apn_summary` | Tóm tắt APN từ file (8 dòng header của WM) |

### APN theo Nhà Mạng VN

| Nhà mạng | APN |
|---|---|
| Mobifone | `m-wap` |
| Viettel | `v-internet` |
| Vietnamobile | *(riêng)* |
| Generic VN | `3HK` fallback |

---

## Cấu Trúc File Báo Giá (WM Native Format)

File CSV/XLSX với các cột:

| Cột | Tên cột gốc | Mô tả |
|---|---|---|
| ID sản phẩm | `wmproductId` | Mã WM nội bộ |
| Tên sản phẩm | `product name` | Tên đầy đủ |
| Khu vực | `region` | Tên vùng/nước |
| Loại | `type` | SIM/eSIM |
| Giá nhập | `cost price NT` | Giá theo đơn vị ngoại tệ |
| leSIM | `leSIM` | `Yes`/`No` |

**Detect tự động:** Nếu file có cột `wmproductId` → parser WM native.  
**GoHub Standard Format:** Nếu sheet tên `Goi co san` hoặc có cột `vendor_code` → parser chuẩn.

> Quy trình import: [[processes/Import-NCC]]

---

## GoHub Standard Format (Mới — v8)

GoHub định nghĩa template chuẩn để WM (và các vendor khác) điền vào:

**Sheet "Goi co san"** — gói cố định:

| Cột | Bắt buộc | Mô tả |
|---|---|---|
| `vendor_code` | ✅ | `WM` |
| `vendor_id` | ✅ | ID vendor nội bộ |
| `product_name` | ✅ | Tên gói |
| `region` | ✅ | Khu vực/nước |
| `sim_type` | ✅ | `SIM` hoặc `eSIM` |
| `days` | ✅ | Số ngày |
| `data_gb` | ✅ | Dung lượng GB |
| `is_daily` | ✅ | `true`/`false` |
| `is_unlimited` | ✅ | `true`/`false` |
| `throttle_mbps` | — | Tốc độ sau throttle (null = no limit) |
| `cost_price` | ✅ | Giá nhập |
| `currency` | ✅ | Đơn vị tiền |
| `apn` | — | APN string |
| `network_type` | — | `4G/LTE`, `5G` |
| `is_kyc` | ✅ | `true`/`false` |
| `is_lesim` | — | `true`/`false` |
| `notes` | — | Ghi chú thêm |

---

## Gap Analysis

Mỗi sản phẩm WM trong DB có cột `exist`:
- `Yes` — GoHub đã tạo SKU tương ứng
- `No` — GoHub **chưa** tạo SKU

**Cập nhật tự động:** `sync.py` chạy daily sẽ re-sync `exist` theo bảng `skus` hiện tại.

> Xem gap: [[products/Combo-Chuan-GoHub#Vendor Priority|Vendor Priority]] + web `/ncc` tab WM

---

## Vendor Priority

WM là vendor **ưu tiên** cho:
- **Hồng Kông (HK)** — no-KYC, giá tốt
- **Đài Loan (TW)** — no-KYC, coverage tốt

> Bảng priority đầy đủ: [[pricing/Vendor-Priority]]
