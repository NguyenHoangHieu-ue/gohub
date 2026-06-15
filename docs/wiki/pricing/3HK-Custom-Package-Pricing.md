---
title: "Ước Tính Chi Phí Gói Tùy Chỉnh 3HK"
page_type: pricing_rule
department: product
tags: [3hk, cogs, formula, pricing, custom, unlimited, throttle]
aliases: ["3HK Custom", "Gói tùy chỉnh 3HK", "Custom throttle pricing"]
created: 2026-06-15
updated: 2026-06-15
status: active
---

# Ước Tính Chi Phí Gói Tùy Chỉnh 3HK

Tài liệu này mở rộng công thức 3HK tiêu chuẩn để áp dụng cho các cấu trúc gói **không theo mẫu 500MB highspeed + throttle** — ví dụ: 1GB/ngày tốc độ cao rồi throttle 2Mbps, hoặc 3GB/ngày tốc độ cao rồi throttle 1Mbps.

> Công thức gốc 3HK: [[pricing/3HK-COGS-Formula]]

---

## Nguyên Tắc Cơ Bản

3HK tính phí theo **dung lượng thực tế tiêu thụ mỗi ngày**, bao gồm cả phần tốc độ cao và phần sau throttle. Tổng tiêu thụ ước tính được tách thành **2 thành phần**:

```
GB_tiêu_thụ/ngày = GB_highspeed_thực + GB_throttle_thực
```

---

## Thành Phần 1 — Highspeed (Tốc Độ Cao)

Không phải mọi user đều dùng hết phần quota tốc độ cao, đặc biệt khi cap lớn. Hệ số sử dụng giảm dần theo kích thước cap:

| Cap tốc độ cao | Hệ số sử dụng | GB thực |
|---|---|---|
| ≤ 500 MB/ngày | **95%** | cap × 0.95 |
| 500 MB – 1 GB/ngày | **90%** | cap × 0.90 |
| 1 – 2 GB/ngày | **85%** | cap × 0.85 |
| 2 – 3 GB/ngày | **80%** | cap × 0.80 |
| > 3 GB/ngày | **70%** | cap × 0.70 |

> **Lý do:** Cap nhỏ (500MB) thì user gần như dùng hết ngay (video call, stream sáng sớm). Cap lớn (3GB+) thì nhiều user không chạm đến giới hạn, đặc biệt ngày ít dùng.

### Kiểm chứng từ dữ liệu hiện có

| Gói hiện tại | Cap | Hệ số đề xuất | GB highspeed ước tính |
|---|---|---|---|
| Unlimited 10 Mbps | 500 MB | 95% | 0.5 × 0.95 = **0.475 GB** |
| Unlimited 5 Mbps | 500 MB | 95% | 0.5 × 0.95 = **0.475 GB** |

---

## Thành Phần 2 — Phần Throttle

Sau khi hết quota tốc độ cao, user vẫn tiêu thụ data ở tốc độ giảm. Lượng tiêu thụ phụ thuộc vào throttle speed:

| Throttle speed | GB tiêu thụ/ngày | Ghi chú |
|---|---|---|
| 10 Mbps | **1.30 GB** | Thực tế từ 3HK — tốc độ cao, user dùng nhiều |
| 5 Mbps | **1.10 GB** | Thực tế từ 3HK — vẫn thoải mái dùng |
| 2 Mbps | **0.60 GB** | Ước tính — dùng được, nhưng chọn lọc hơn |
| 1 Mbps | **0.35 GB** | Ước tính — chủ yếu nhắn tin, đọc web nhẹ |
| 512 kbps | **0.15 GB** | Ước tính — rất chậm, hạn chế |
| 128 kbps | **0.05 GB** | Rất ít — gần như chỉ nhắn tin |

> **Lưu ý:** Dòng 10 Mbps và 5 Mbps là dữ liệu xác nhận từ công thức 3HK hiện tại. Các dòng còn lại là ước tính — nên thêm buffer khi dùng lần đầu.

### Kiểm chứng từ dữ liệu hiện có

| Gói hiện tại | Throttle | GB throttle thực tế | GB throttle ước tính |
|---|---|---|---|
| Unlimited 10 Mbps | 10 Mbps | 1.8 - 0.475 = **1.325 GB** | 1.30 GB ✓ |
| Unlimited 5 Mbps | 5 Mbps | 1.6 - 0.475 = **1.125 GB** | 1.10 GB ✓ |

---

## Công Thức Tổng Quát

```
GB_daily = (cap × hệ_số_hs) + GB_throttle(throttle_speed)

COGS/ngày (HKD) = GB_daily × giá_vùng
COGS_total (HKD) = COGS/ngày × số_ngày
```

Quy đổi sang USD và VND: [[pricing/FX-Rates]]

---

## Ví Dụ: Gói 3GB/ngày Tốc Độ Cao + Throttle 1 Mbps

**Cấu trúc gói:**
- Highspeed cap: 3 GB/ngày
- Throttle sau cap: 1 Mbps

**Tính GB thực:**

| Thành phần | Tính toán | Kết quả |
|---|---|---|
| Highspeed | 3 GB × 80% | 2.40 GB |
| Throttle 1 Mbps | (tra bảng) | 0.35 GB |
| **Tổng/ngày** | | **2.75 GB** |

**Tính COGS (ví dụ vùng Châu Á — 5 HKD/GB):**

| | |
|---|---|
| COGS/ngày (HKD) | 2.75 × 5 = **13.75 HKD** |
| COGS 7 ngày (HKD) | 13.75 × 7 = **96.25 HKD** |
| COGS 7 ngày (USD) | 96.25 / 7.798 = **12.34 USD** |
| COGS 7 ngày (VND) | 12.34 × 26.394 = **325.701 VND** |

---

## Bảng Tham Chiếu Nhanh — GB/Ngày Ước Tính

*(vùng Châu Á — 5 HKD/GB)*

| Highspeed cap | Throttle | GB/ngày | COGS/ngày (HKD) |
|---|---|---|---|
| 500 MB | 10 Mbps | 1.78 | 8.9 |
| 500 MB | 5 Mbps | 1.58 | 7.9 |
| 1 GB | 5 Mbps | 1.95 | 9.8 |
| 1 GB | 2 Mbps | 1.45 | 7.3 |
| 2 GB | 5 Mbps | 2.80 | 14.0 |
| 2 GB | 2 Mbps | 2.30 | 11.5 |
| 2 GB | 1 Mbps | 2.05 | 10.3 |
| 3 GB | 2 Mbps | 3.00 | 15.0 |
| **3 GB** | **1 Mbps** | **2.75** | **13.8** |
| 3 GB | 512 kbps | 2.55 | 12.8 |
| 5 GB | 1 Mbps | 3.85 | 19.3 |

---

## Khuyến Nghị Khi Triển Khai Gói Mới

1. **Thêm buffer 10–15% vào COGS ước tính** cho lần đầu ra mắt gói mới — dữ liệu thực tế chưa có, ước tính có thể lệch.

2. **Theo dõi 1–2 tháng đầu** để xem mức tiêu thụ thực tế có khớp với ước tính không → điều chỉnh lại hệ số nếu cần.

3. **So sánh với WM** cùng cấu hình trước khi ra mắt — nếu WM có gói tương đương, 3HK cần có lợi thế gì đó (giá, vùng phủ, KYC...).

4. **Throttle 1 Mbps là điểm mới** — chưa có dữ liệu thực tế từ 3HK. Nên dùng con số 0.35 GB/ngày như ước tính bảo thủ, có thể cao hơn thực tế → tốt cho margin.

---

## Liên Quan

- [[pricing/3HK-COGS-Formula]] — công thức gốc (gói 500MB hiện tại)
- [[pricing/FX-Rates]] — tỷ giá quy đổi
- [[vendors/3HK]] — thông tin vendor 3HK
- [[pricing/Vendor-Priority]] — khi nào dùng 3HK vs WM
