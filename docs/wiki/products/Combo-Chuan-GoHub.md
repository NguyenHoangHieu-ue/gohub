---
title: "Combo Chuẩn GoHub (42 combo/country)"
page_type: product_guide
department: product
tags: [combo, sku, standard, gap-analysis, product-guide]
aliases: ["Combo Chuẩn", "42 combo", "GoHub Standard Combo"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# Combo Chuẩn GoHub

## Quy Tắc Cốt Lõi

> Mỗi nước GoHub triển khai đều cần **đủ 42 combo** — gồm 3 nhóm × 7 biến thể ngày.

Khi chatbot / gap analysis nói "thiếu combo" → nghĩa là **cần yêu cầu vendor tạo thêm**, không phải vendor hết hàng.

---

## 42 Combo = 3 Nhóm × 6 Biến Thể Ngày

### Nhóm 1: Daily Data (Data theo ngày)

| Dung lượng | 7 ngày | 14 ngày | 21 ngày | 30 ngày | 60 ngày | 90 ngày |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 GB/ngày | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 GB/ngày | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 GB/ngày | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

→ **18 combo** (3 mức GB × 6 mốc ngày)

### Nhóm 2: Fixed Data (Tổng cố định)

| Dung lượng | 7 ngày | 14 ngày | 21 ngày | 30 ngày | 60 ngày | 90 ngày |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 5 GB | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 10 GB | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 20 GB | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

→ **18 combo** (3 mức GB × 6 mốc ngày)

### Nhóm 3: Unlimited

| Loại | 7 ngày | 14 ngày | 21 ngày | 30 ngày | 60 ngày | 90 ngày |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Unlimited | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

→ **6 combo** (1 loại × 6 mốc ngày)

---

## Tổng: 18 + 18 + 6 = **42 combo**

---

## Thuật Ngữ Quan Trọng

| Tình huống | Diễn đạt ĐÚNG | Diễn đạt SAI |
|---|---|---|
| GoHub chưa tạo SKU cho gói đó | "Cần yêu cầu vendor tạo thêm SKU" | "Vendor không có hàng" |
| SKU đang bán được | "Có trong hệ thống GoHub" | "Có sẵn" (mơ hồ) |
| GoHub chưa tạo SKU | "Chưa có trong hệ thống GoHub" | "Hết hàng" |
| WM có gói, GoHub đã tạo SKU | "WM có, GoHub đã tạo" | — |
| WM có gói, GoHub chưa tạo SKU | "WM có, GoHub chưa tạo" | — |

---

## Ưu Tiên Vendor Theo Nước

> Chi tiết đầy đủ: [[pricing/Vendor-Priority]]

| Nước / Khu vực | Vendor ưu tiên | Lý do |
|---|---|---|
| Hồng Kông | **WM** | Không cần KYC, giá tốt |
| Đài Loan | **WM** | Không cần KYC, phủ sóng tốt |
| Nhật Bản | **KDDI** | Partnership riêng |
| Các nước khác | **3HK** trước | Phủ sóng rộng hơn |
| BC / JY | Last resort | Khi WM + 3HK không có |

---

## Quy Trình Gap Analysis

```
1. Lấy 42 combo chuẩn cho nước X
2. Kiểm tra SKU đang bán được trong GoHub
3. Kiểm tra catalog WM (gói nào đã tạo / chưa tạo)
4. Kết quả:
   - GoHub đã có: N/42 combo
   - WM có nhưng GoHub chưa tạo: M combo
   - WM không có: K combo → cần yêu cầu vendor
```

> Xem trực tiếp: Web **SP Vendor** → Tab WM → Bộ lọc "Chưa có trong HT"
