---
title: "Công Thức Tính Giá Nhập — 3HK"
page_type: pricing_rule
department: finance
tags: [3hk, cogs, formula, pricing, zone]
aliases: ["3HK COGS", "Công thức 3HK", "3HK Formula"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# Công Thức Tính Giá Nhập — 3HK

## Nguyên Lý

3HK tính phí theo **dung lượng thực tế tiêu thụ** (không phải gói danh nghĩa).
Người dùng thường không dùng hết 100% — GoHub dùng **hệ số thực tế** để ước tính giá nhập.

---

## Hệ Số Theo Loại Gói

| Loại gói | Hệ số | Cách tính GB thực |
|---|---|---|
| **Fixed Data** | **55%** | GB gói × 0.55 |
| **Daily Data** | **40%** | GB/ngày × số ngày × 0.40 |
| **Unlimited 10 Mbps** | **100%** (1.8 GB/ngày) | 1.8 GB × số ngày |
| **Unlimited 5 Mbps** | **100%** (1.6 GB/ngày) | 1.6 GB × số ngày |

---

## Công Thức Đầy Đủ

### Bước 1 — Tính GB thực

```
Fixed:          GB thực = dung lượng gói × 0.55
Daily:          GB thực = (GB/ngày) × số ngày × 0.40
Unlim 10 Mbps:  GB thực = 1.8 × số ngày
Unlim 5 Mbps:   GB thực = 1.6 × số ngày
```

### Bước 2 — Tra giá vùng (HKD/GB)

```
Châu Á 12 nước:   5 HKD/GB
Châu Âu + Mỹ:     7 HKD/GB
Úc + New Zealand: 6.5 HKD/GB
```

> Danh sách vùng đầy đủ: [[vendors/3HK#Giá Theo Vùng|3HK — Giá theo vùng]]

### Bước 3 — Tính giá nhập

```
Giá nhập (HKD) = GB thực × giá/GB
Giá nhập (USD) = Giá nhập (HKD) / 7.798
Giá nhập (VND) = Giá nhập (USD) × 26.394
```

> Tỷ giá: [[pricing/FX-Rates]]

---

## Ví Dụ Tính Toán

### Ví dụ 1: Fixed 10 GB, Nhật Bản (5 HKD/GB)

```
GB thực       = 10 × 0.55 = 5.5 GB
Giá nhập HKD  = 5.5 × 5 = 27.5 HKD
Giá nhập USD  = 27.5 / 7.798 = 3.53 USD
Giá nhập VND  = 3.53 × 26.394 = 93.050 VND
```

### Ví dụ 2: Daily 2 GB/ngày × 30 ngày, Châu Âu (7 HKD/GB)

```
GB thực       = 2 × 30 × 0.40 = 24 GB
Giá nhập HKD  = 24 × 7 = 168 HKD
Giá nhập USD  = 168 / 7.798 = 21.54 USD
Giá nhập VND  = 21.54 × 26.394 = 568.625 VND
```

### Ví dụ 3: Unlimited 10 Mbps × 7 ngày, Singapore (5 HKD/GB)

```
GB thực       = 1.8 × 7 = 12.6 GB
Giá nhập HKD  = 12.6 × 5 = 63 HKD
Giá nhập USD  = 63 / 7.798 = 8.08 USD
Giá nhập VND  = 8.08 × 26.394 = 213.264 VND
```

---

## Lưu Ý

> **3HK chỉ là tham khảo** — chatbot không tự tính gói, chỉ thông báo vùng/giá/KYC.
> Tính giá nhập thực tế là việc của team product khi tạo SKU mới.

### Khi nào dùng công thức này?
1. Tạo SKU mới từ catalog 3HK
2. So sánh giá WM vs 3HK cho cùng nước / loại gói
3. Kiểm tra lợi nhuận trước khi đưa sản phẩm lên kênh bán

---

## Điều Chỉnh Hệ Số

Hệ số 55% / 40% và mức 1.8 / 1.6 GB có thể chỉnh tại:
Web **Admin** → **Cài đặt** → **Công thức 3HK Datapool**

Thay đổi có hiệu lực ngay khi lưu.
