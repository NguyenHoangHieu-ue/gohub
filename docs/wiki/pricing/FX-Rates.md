---
title: "Tỷ Giá Nội Bộ GoHub"
page_type: pricing_rule
department: finance
tags: [ty-gia, fx-rates, usd, vnd, hkd, pricing]
aliases: ["Tỷ giá", "FX Rates", "Exchange Rates"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# Tỷ Giá Nội Bộ GoHub

## Tỷ Giá T06/2026 (Hiện Hành)

| Cặp tiền | Tỷ giá | Ghi chú |
|---|---|---|
| **USD/VND** | **26,394** | 1 USD = 26,394 VND |
| **HKD/USD** | **7.798** | 1 USD = 7.798 HKD |
| **TWD/USD** | **31.452** | 1 USD = 31.452 TWD |

> Tỷ giá được lưu trong bảng `app_settings` (Supabase) và cập nhật thủ công bởi admin.  
> Web UI: `/admin` → Tab **Cài đặt** → Tỷ giá nội bộ.

---

## Danh Sách Currencies Hỗ Trợ (11 loại)

| Ký hiệu | Tên | Dùng cho vendor |
|---|---|---|
| `USD` | US Dollar | Giá gốc chuẩn |
| `VND` | Vietnamese Dong | Hiển thị VN |
| `HKD` | Hong Kong Dollar | 3HK |
| `TWD` | New Taiwan Dollar | — |
| `JPY` | Japanese Yen | KDDI |
| `EUR` | Euro | — |
| `GBP` | British Pound | — |
| `AUD` | Australian Dollar | — |
| `SGD` | Singapore Dollar | — |
| `THB` | Thai Baht | — |
| `KRW` | Korean Won | — |

---

## Quy Đổi COGS

### WM Products (giá tính bằng đồng ngoại tệ vendor)

```
COGS (USD) = cost_price / exchange_rate_to_usd
COGS (VND) = COGS (USD) × 26,394
```

**Ví dụ:** WM gói Japan giá 5.5 USD
```
COGS USD = 5.5 USD
COGS VND = 5.5 × 26,394 = 145,167 VND
```

### 3HK (giá HKD/GB → tính thành USD)

```
GB thực = GB danh nghĩa × hệ số (xem công thức 3HK)
COGS (HKD) = GB thực × price_per_gb
COGS (USD) = COGS (HKD) / 7.798
COGS (VND) = COGS (USD) × 26,394
```

> Công thức chi tiết: [[pricing/3HK-COGS-Formula]]

---

## Hiển Thị COGS trong Hệ Thống

| Role | Hiển thị |
|---|---|
| Admin | USD + VND |
| Manager | USD + VND |
| Standard | Ẩn (không thấy giá vốn) |

**Quy tắc hiển thị theo tenant:**
- Tenant **VN** → chỉ hiện VND
- Tenant **US** → chỉ hiện USD

---

## Cập Nhật Tỷ Giá

1. Truy cập web `/admin` → **Cài đặt**
2. Chỉnh sửa tỷ giá trực tiếp trong bảng
3. Lưu → hệ thống cập nhật `app_settings` trong Supabase
4. Chatbot và COGS calculation tự động dùng tỷ giá mới (cache refresh 30 phút)

---

## Lịch Sử Tỷ Giá

| Kỳ | USD/VND | HKD/USD | TWD/USD |
|---|---|---|---|
| T03/2026 | 26,394 | 7.798 | 31.452 |
| T06/2026 | 26,394 | 7.798 | 31.452 |

*(Cập nhật khi có thay đổi)*
