---
title: "Tỷ Giá Nội Bộ GoHub"
page_type: pricing_rule
department: finance
audience: cs-product
visibility: all
tags: [ty-gia, fx-rates, usd, vnd, hkd, pricing, tu-van]
aliases: ["Tỷ giá", "FX Rates", "Exchange Rates"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-08-22
status: active
---

# Tỷ Giá Nội Bộ GoHub

## Tỷ Giá T06/2026 (Hiện Hành)

| Cặp tiền | Tỷ giá | Ghi chú |
|---|---|---|
| **USD/VND** | **26.394** | 1 USD = 26.394 VND |
| **HKD/USD** | **7.798** | 1 USD = 7.798 HKD |
| **TWD/USD** | **31.452** | 1 USD = 31.452 TWD |

> Tỷ giá do admin cập nhật thủ công. Cập nhật tại: Web **Admin** → Tab **Cài đặt** → Tỷ giá nội bộ.

---

## Đơn Vị Tiền Hỗ Trợ (11 loại)

| Ký hiệu | Tên | Dùng cho |
|---|---|---|
| `USD` | Đô la Mỹ | Giá gốc chuẩn |
| `VND` | Đồng Việt Nam | Hiển thị kênh VN |
| `HKD` | Đô la Hồng Kông | 3HK |
| `TWD` | Đô la Đài Loan | — |
| `JPY` | Yên Nhật | KDDI |
| `EUR` | Euro | — |
| `GBP` | Bảng Anh | — |
| `AUD` | Đô la Úc | — |
| `SGD` | Đô la Singapore | — |
| `THB` | Baht Thái | — |
| `KRW` | Won Hàn | — |

---

## Quy Đổi Giá Nhập

### Sản phẩm WM

```
Giá nhập (USD) = giá vendor / tỷ giá đơn vị tiền → USD
Giá nhập (VND) = Giá nhập (USD) × 26.394
```

**Ví dụ:** Gói Japan giá 5.5 USD
```
Giá nhập VND = 5.5 × 26.394 = 145.167 VND
```

### Sản phẩm 3HK

```
GB thực = GB danh nghĩa × hệ số (xem công thức 3HK)
Giá nhập (HKD) = GB thực × giá/GB
Giá nhập (USD) = Giá nhập (HKD) / 7.798
Giá nhập (VND) = Giá nhập (USD) × 26.394
```

> Công thức chi tiết: [[pricing/3HK-COGS-Formula]]

---

## Hiển Thị Giá Theo Role

| Role | Hiển thị |
|---|---|
| Admin | USD và VND |
| Manager | USD và VND |
| Staff | Ẩn — không thấy giá vốn |

**Theo kênh bán:**
- Kênh **VN** → hiển thị VND
- Kênh **US** → hiển thị USD

---

## Cập Nhật Tỷ Giá

1. Vào web **Admin** → **Cài đặt**
2. Chỉnh sửa tỷ giá trực tiếp
3. Lưu → toàn bộ tính toán tự động dùng tỷ giá mới (làm mới sau 30 phút)

---

## Lịch Sử Tỷ Giá

| Kỳ | USD/VND | HKD/USD | TWD/USD |
|---|---|---|---|
| T03/2026 | 26.394 | 7.798 | 31.452 |
| T06/2026 | 26.394 | 7.798 | 31.452 |

*(Cập nhật khi có thay đổi)*
