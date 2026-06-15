---
title: "Định Giá Gói FUP Tùy Chỉnh 3HK"
page_type: pricing_rule
department: product
tags: [3hk, cogs, formula, pricing, custom, fup, throttle]
aliases: ["3HK FUP", "Gói FUP 3HK", "Custom throttle pricing", "FUP pricing"]
created: 2026-06-15
updated: 2026-06-15
status: active
---

# Định Giá Gói FUP Tùy Chỉnh 3HK

Tài liệu này hướng dẫn cách tính chi phí và xây dựng mức giá bán cho các gói có cấu trúc:

> **X GB tốc độ cao / ngày → hết quota → Y GB FUP ở tốc độ Z Mbps / ngày**

Khác với gói unlimited throttle (throttle vô hạn sau quota), FUP là **dung lượng cố định thứ hai** — dùng hết cả X+Y GB thì dừng (hoặc cắt về 128kbps).

> Công thức gốc 3HK: [[pricing/3HK-COGS-Formula]]

---

## Tại Sao FUP Cố Định Tốt Hơn Unlimited Throttle?

| | FUP cố định | Unlimited throttle |
|---|---|---|
| Chi phí 3HK | Có giới hạn, dự đoán được | Không có trần, biến động |
| Trải nghiệm khách | Rõ ràng — biết còn bao nhiêu | Mờ — không biết đang dùng bao nhiêu |
| Định giá | Chính xác hơn | Phải ước tính hệ số tiêu thụ |
| Kiểm soát margin | Dễ hơn | Rủi ro nếu hệ số ước tính sai |

---

## Công Thức Tính Chi Phí (COGS)

```
GB_daily = (hs_cap × util_hs) + (fup_cap × util_fup)

COGS_total (HKD) = GB_daily × số_ngày × giá_vùng (HKD/GB)
COGS (USD)       = COGS_total / 7.798
COGS (VND)       = COGS (USD) × 26.394
```

---

## Hệ Số Sử Dụng

### Phần Tốc Độ Cao (util_hs)

| Cap/ngày | Hệ số | Lý do |
|---|---|---|
| ≤ 1 GB | **90%** | Dễ đạt giới hạn, đặc biệt ngày dùng nhiều |
| 1–2 GB | **85%** | Hầu hết user chạm giới hạn |
| 2–3 GB | **80%** | Một phần user không đạt limit |
| > 3 GB | **70%** | Khá nhiều user không dùng hết |

### Phần FUP (util_fup)

FUP được kích hoạt **chỉ khi user đã dùng hết phần tốc độ cao** — tức là người có nhu cầu cao và đang cần thêm data. Do đó tỷ lệ sử dụng FUP **cao hơn** highspeed cap cùng kích thước.

| FUP cap/ngày | Throttle | Hệ số FUP | Lý do |
|---|---|---|---|
| ≤ 1 GB | 2 Mbps+ | **88%** | Tốc độ dùng được, user tiêu thụ gần hết |
| ≤ 1 GB | 1 Mbps | **82%** | Chậm hơn nhưng vẫn dùng được |
| ≤ 1 GB | 512 kbps | **65%** | Khá chậm, user hạn chế dùng |
| 1–2 GB | 2 Mbps+ | **80%** | Lượng lớn, không phải ai cũng dùng hết |
| 1–2 GB | 1 Mbps | **72%** | Chậm + lượng lớn → ít dùng hơn |
| 1–2 GB | 512 kbps | **50%** | Rất ít người dùng hết phần này |
| > 2 GB | 1 Mbps | **60%** | Quá nhiều cho tốc độ này |
| > 2 GB | 512 kbps | **35%** | Gần như chỉ dùng khi cần thiết |

---

## Giá Trị FUP Theo Mức Throttle — Hướng Dẫn Định Giá Bán

Throttle speed quyết định **chất lượng trải nghiệm** của phần FUP, từ đó quyết định user sẵn lòng trả bao nhiêu.

| Throttle | Trải nghiệm người dùng | Hệ số giá trị so với highspeed |
|---|---|---|
| 2 Mbps | Xem video SD, video call chất lượng thấp, stream nhạc | **60%** |
| 1 Mbps | Nhắn tin, đọc web, bản đồ, nhạc | **45%** |
| 512 kbps | Nhắn tin, email, tìm đường cơ bản | **25%** |
| 128 kbps | Chỉ tin nhắn văn bản | **10%** |

**Cách dùng bảng này:**

Nếu 1 GB highspeed (tốc độ đầy đủ) bán với giá **P VND**, thì:
- 1 GB FUP @ 2 Mbps nên có giá thêm **~0.60 × P**
- 1 GB FUP @ 1 Mbps nên có giá thêm **~0.45 × P**
- 1 GB FUP @ 512 kbps nên có giá thêm **~0.25 × P**

Điều này đảm bảo giá bán phản ánh đúng giá trị thực tế, không bán FUP quá rẻ (mất margin) hoặc quá đắt (mất cạnh tranh).

---

## Bảng COGS Tham Chiếu

*(Vùng Châu Á — 5 HKD/GB, tỷ giá: 1 USD = 7.798 HKD = 26.394 VND)*

### Gói 7 ngày

| Cấu trúc | GB/ngày ước tính | COGS 7 ngày (HKD) | COGS (USD) | COGS (VND) |
|---|---|---|---|---|
| 1GB hs + 0.5GB FUP 1Mbps | 1×90% + 0.5×82% = **1.31** | 45.9 | 5.88 | 155.200 |
| 1GB hs + 1GB FUP 1Mbps | 1×90% + 1×82% = **1.72** | 60.2 | 7.72 | 203.800 |
| 2GB hs + 1GB FUP 2Mbps | 2×85% + 1×88% = **2.58** | 90.3 | 11.58 | 305.700 |
| 2GB hs + 1GB FUP 1Mbps | 2×85% + 1×82% = **2.52** | 88.2 | 11.31 | 298.600 |
| 2GB hs + 1GB FUP 512kbps | 2×85% + 1×65% = **2.35** | 82.3 | 10.55 | 278.500 |
| **3GB hs + 1GB FUP 1Mbps** | 3×80% + 1×82% = **3.22** | 112.7 | 14.45 | 381.500 |
| 3GB hs + 1GB FUP 2Mbps | 3×80% + 1×88% = **3.28** | 114.8 | 14.72 | 388.700 |
| 3GB hs + 1GB FUP 512kbps | 3×80% + 1×65% = **3.05** | 106.8 | 13.69 | 361.500 |
| 3GB hs + 2GB FUP 1Mbps | 3×80% + 2×72% = **3.84** | 134.4 | 17.24 | 455.100 |
| 5GB hs + 2GB FUP 1Mbps | 5×70% + 2×72% = **4.94** | 172.9 | 22.17 | 585.300 |

### Gói 30 ngày

| Cấu trúc | COGS 30 ngày (HKD) | COGS (USD) | COGS (VND) |
|---|---|---|---|
| 1GB hs + 1GB FUP 1Mbps | 258 | 33.1 | 873.900 |
| 2GB hs + 1GB FUP 1Mbps | 378 | 48.5 | 1.280.100 |
| 3GB hs + 1GB FUP 1Mbps | 483 | 61.9 | 1.634.800 |
| 3GB hs + 2GB FUP 1Mbps | 576 | 73.9 | 1.950.700 |

---

## So Sánh Các Mức Throttle Cùng Cấu Hình

Ví dụ: Gói 7 ngày, 3GB highspeed + 1GB FUP, vùng Châu Á

| Throttle FUP | COGS (VND) | Giá trị FUP vs hs | Gợi ý giá thêm so với gói 3GB thuần |
|---|---|---|---|
| 2 Mbps | ~389.000 | 60% | Cao nhất |
| 1 Mbps | ~382.000 | 45% | Trung bình |
| 512 kbps | ~362.000 | 25% | Thấp hơn |

→ Chi phí 3HK giữa các mức throttle **không chênh nhiều** (vì đều tính theo GB), nhưng **giá trị với khách hàng chênh đáng kể**. Đây là cơ hội để cấu trúc tier pricing hợp lý.

---

## Gợi Ý Tier System

Ví dụ cho gói 7 ngày vùng Châu Á, giả sử margin mục tiêu ~40%:

| Tier | Cấu trúc | COGS (VND) | Giá bán gợi ý (VND) |
|---|---|---|---|
| Starter | 1GB hs + 0.5GB FUP 512kbps | ~117.000 | 195.000 |
| Basic | 1GB hs + 1GB FUP 1Mbps | ~204.000 | 340.000 |
| Standard | 2GB hs + 1GB FUP 1Mbps | ~299.000 | 499.000 |
| Pro | 3GB hs + 1GB FUP 1Mbps | ~382.000 | 639.000 |
| Pro+ | 3GB hs + 2GB FUP 1Mbps | ~455.000 | 759.000 |
| Max | 5GB hs + 2GB FUP 2Mbps | ~595.000 | 990.000 |

> **Lưu ý:** Giá bán trên chỉ là ví dụ với 40% margin. Cần điều chỉnh theo giá thị trường, giá WM cùng loại, và định vị kênh bán.

---

## Lưu Ý Quan Trọng

1. **Hệ số sử dụng FUP là ước tính** — chưa có dữ liệu thực tế từ 3HK cho mô hình này. Nên thêm **buffer 10%** vào COGS khi lần đầu ra gói.

2. **So sánh với WM** trước khi định giá — nếu WM có gói fixed tương đương và rẻ hơn, cần điều chỉnh.

3. **Throttle 1 Mbps là điểm ngọt** — đủ tốt để user thấy có giá trị, nhưng vẫn tiết kiệm chi phí hơn 2 Mbps. Tốt để làm tier Standard.

4. **FUP > 2GB ở 1Mbps** thường không hiệu quả — user ít dùng hết, giá trị thực thấp. Thay vào đó nên tăng highspeed cap.

---

## Liên Quan

- [[pricing/3HK-COGS-Formula]] — công thức gốc (gói unlimited throttle)
- [[pricing/FX-Rates]] — tỷ giá
- [[vendors/3HK]] — thông tin vendor
- [[pricing/Vendor-Priority]] — khi nào dùng 3HK vs WM
