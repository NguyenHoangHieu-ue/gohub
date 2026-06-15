---
title: "Vendor — WorldMove (WM)"
page_type: vendor_profile
department: product
tags: [vendor, worldmove, wm, apn, esim, sim]
aliases: ["WorldMove", "WM", "WORLDMOVE"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# WorldMove (WM)

## Thông Tin Cơ Bản

| Thuộc tính | Giá trị |
|---|---|
| Mã vendor | `WM` |
| Ký tự trong SKU (vị trí 6–7) | `WM` |
| Loại báo giá | Gói cố định |
| Tổng sản phẩm | **8.921 gói** |
| Yêu cầu KYC | Không |
| Hỗ trợ eSIM | Có (tùy gói) |

---

## Các Loại Gói WM

### 1. Titanium AYCE (All You Can Eat)
- **Data:** Không giới hạn, không giảm tốc độ
- **Data Policy:** `D`

### 2. Premium Unlimited
- **Data:** Không giới hạn — tốc độ cao 1 GB/ngày, sau đó tối thiểu **10 Mbps**
- **Data Policy:** `A`

### 3. Standard Unlimited
- **Data:** Không giới hạn — tốc độ cao 2 GB/ngày, sau đó tối thiểu **5 Mbps**
- **Data Policy:** `B`

### 4. Fixed Data
- **Data:** Tổng cố định (ví dụ 5 GB, 10 GB)
- **Sau khi hết:** Tốc độ giảm xuống 128 kbps
- **Data Policy:** `F` hoặc `P`

### 5. Daily Data
- **Data:** Cấp theo từng ngày (ví dụ 1 GB/ngày)
- **Sau khi hết quota ngày:** Tốc độ giảm xuống 128 kbps
- **Data Policy:** `P`

> Bảng đầy đủ: [[products/Data-Policy-Codes]]

---

## Thông Tin APN

APN (Access Point Name) là cấu hình mạng thiết bị cần để kết nối internet khi dùng gói WM.

### Cách hiển thị trong hệ thống

```
Vietnam (Mobifone, Viettel, Vinaphone)
```
→ Tên vùng/nước + danh sách nhà mạng hỗ trợ

### APN theo nhà mạng Việt Nam

| Nhà mạng | APN |
|---|---|
| Mobifone | `m-wap` |
| Viettel | `v-internet` |
| Vietnamobile | Riêng theo gói |

### Thông tin kèm theo mỗi gói

- Loại mạng (4G/LTE, 5G)
- Nhà mạng chính và danh sách nhà mạng hỗ trợ
- Vùng phủ sóng
- Giờ reset data hàng ngày
- Thông báo khi hết quota

---

## Format File Báo Giá

### WM Native Format (CSV/XLSX cũ)
Nhận dạng bằng cột `wmproductId`.

Các cột: ID sản phẩm, tên, khu vực, loại SIM/eSIM, giá nhập, có leSIM hay không.

### GoHub Standard Format (XLSX mới)

Template chuẩn GoHub — WM (và các vendor khác) điền theo. Tải template tại web **SP Vendor → Tải template**.

**Sheet "Goi co san"** — gói cố định:

| Cột | Bắt buộc | Mô tả |
|---|---|---|
| `vendor_code` | ✅ | `WM` |
| `vendor_id` | ✅ | ID nội bộ vendor |
| `product_name` | ✅ | Tên gói |
| `region` | ✅ | Khu vực / nước |
| `sim_type` | ✅ | `SIM` hoặc `eSIM` |
| `days` | ✅ | Số ngày |
| `data_gb` | ✅ | Dung lượng GB |
| `is_daily` | ✅ | `true` / `false` |
| `is_unlimited` | ✅ | `true` / `false` |
| `throttle_mbps` | — | Tốc độ tối thiểu sau hết quota (để trống = không giới hạn) |
| `cost_price` | ✅ | Giá nhập |
| `currency` | ✅ | Đơn vị tiền |
| `apn` | — | APN string |
| `network_type` | — | `4G/LTE`, `5G` |
| `is_kyc` | ✅ | `true` / `false` |
| `is_lesim` | — | `true` / `false` |
| `notes` | — | Ghi chú |

> Quy trình import: [[processes/Import-NCC]]

---

## Gap Analysis

Mỗi sản phẩm WM được đánh dấu:
- **Đã tạo** — GoHub đã có SKU tương ứng
- **Chưa tạo** — GoHub chưa nhập vào hệ thống

Trạng thái cập nhật tự động mỗi ngày sau khi đồng bộ.

> Xem chi tiết: Web **SP Vendor** → Tab WM → Bộ lọc "Chưa có trong HT"

---

## Ưu Tiên Vendor

WM là lựa chọn **ưu tiên** cho:
- **Hồng Kông** — không cần KYC, giá cạnh tranh
- **Đài Loan** — không cần KYC, phủ sóng tốt

> Bảng ưu tiên đầy đủ: [[pricing/Vendor-Priority]]
