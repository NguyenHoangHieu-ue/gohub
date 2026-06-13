---
title: "Công Thức Tính COGS — 3HK"
page_type: pricing_rule
department: finance
tags: [3hk, cogs, formula, pricing, zone]
aliases: ["3HK COGS", "Công thức 3HK", "3HK Formula"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# Công Thức Tính COGS — 3HK

## Nguyên Lý

3HK tính phí theo **dung lượng thực tế tiêu thụ** (không phải gói danh nghĩa).  
Người dùng không bao giờ dùng hết 100% → GoHub dùng **hệ số thực tế** để ước tính COGS.

---

## Bảng Hệ Số Theo Loại Gói

| Loại gói | Hệ số | Công thức GB thực |
|---|---|---|
| **Fixed Data** | **55%** | `GB danh nghĩa × 0.55` |
| **Daily Data** | **40%** | `GB/ngày × số ngày × 0.40` |
| **Unlimited 10 Mbps** | **100%** (1.8 GB/ngày) | `1.8 GB × số ngày` |
| **Unlimited 5 Mbps** | **100%** (1.6 GB/ngày) | `1.6 GB × số ngày` |

---

## Công Thức Đầy Đủ

### Bước 1 — Tính GB thực

```
Fixed:           gb_actual = data_gb × 0.55
Daily:           gb_actual = (data_gb/day) × days × 0.40
Unlim 10Mbps:    gb_actual = 1.8 × days
Unlim 5Mbps:     gb_actual = 1.6 × days
```

### Bước 2 — Tra giá zone (HKD/GB)

```
Châu Á 12 nước:   5 HKD/GB
Châu Âu + Mỹ:     7 HKD/GB
Australia + NZ:   6.5 HKD/GB
```

> Danh sách zone đầy đủ: [[vendors/3HK#Bảng Giá Theo Zone (HKD/GB)|3HK Zone Pricing]]

### Bước 3 — Tính COGS

```
COGS (HKD) = gb_actual × price_per_gb
COGS (USD) = COGS (HKD) / 7.798
COGS (VND) = COGS (USD) × 26,394
```

> Tỷ giá: [[pricing/FX-Rates]]

---

## Ví Dụ Tính Toán

### Ví dụ 1: Fixed 10GB, Japan (5 HKD/GB)

```
gb_actual = 10 × 0.55 = 5.5 GB
COGS HKD  = 5.5 × 5 = 27.5 HKD
COGS USD  = 27.5 / 7.798 = 3.53 USD
COGS VND  = 3.53 × 26,394 = 93,050 VND
```

### Ví dụ 2: Daily 2GB/ngày × 30 ngày, Europe (7 HKD/GB)

```
gb_actual = 2 × 30 × 0.40 = 24 GB
COGS HKD  = 24 × 7 = 168 HKD
COGS USD  = 168 / 7.798 = 21.54 USD
COGS VND  = 21.54 × 26,394 = 568,625 VND
```

### Ví dụ 3: Unlimited 10Mbps × 7 ngày, Singapore (5 HKD/GB)

```
gb_actual = 1.8 × 7 = 12.6 GB
COGS HKD  = 12.6 × 5 = 63 HKD
COGS USD  = 63 / 7.798 = 8.08 USD
COGS VND  = 8.08 × 26,394 = 213,264 VND
```

---

## Lưu Ý Quan Trọng

> **3HK chỉ là reference** — chatbot không tự tính gói, chỉ thông báo zone/giá/KYC.  
> Tính COGS thực tế là việc của team product/Hiếu khi tạo SKU mới.

### Khi nào dùng công thức này?
1. Team muốn tạo SKU mới từ 3HK catalog
2. So sánh giá WM vs 3HK cho cùng nước/loại gói
3. Kiểm tra lợi nhuận trước khi đưa sản phẩm lên kênh

---

## Công Thức trong Admin UI

Web `/admin` → Tab **Cài đặt** → **Công thức 3HK Datapool**

Admin có thể chỉnh hệ số 55%/40% và 1.8/1.6 GB trực tiếp trên web.  
Hệ thống lưu vào `app_settings` → tất cả tính toán tự động dùng giá trị mới.
