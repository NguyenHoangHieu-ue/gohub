---
title: "Combo Chuẩn GoHub (42 combo/country)"
page_type: product_guide
department: product
tags: [combo, sku, standard, gap-analysis, product-guide]
aliases: ["Combo Chuẩn", "42 combo", "GoHub Standard Combo"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# Combo Chuẩn GoHub

## Quy Tắc Cốt Lõi

> Mỗi nước GoHub triển khai đều cần **đủ 42 combo** — bao gồm 3 nhóm × 7 biến thể ngày.

Khi chatbot / gap analysis nói "thiếu combo" → nghĩa là **cần request vendor tạo thêm SKU**, không phải vendor không có hàng.

---

## 42 Combo = 3 Nhóm × 14 (6+1 variants × ngày)

### Nhóm 1: Daily Data (Data theo ngày)

| Dung lượng | 7 ngày | 14 ngày | 21 ngày | 30 ngày | 60 ngày | 90 ngày |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 GB/ngày | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 GB/ngày | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 GB/ngày | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

→ **18 combo** (3 loại GB × 6 variants ngày)

### Nhóm 2: Fixed Data (Tổng cố định)

| Dung lượng | 7 ngày | 14 ngày | 21 ngày | 30 ngày | 60 ngày | 90 ngày |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| 5 GB total | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 10 GB total | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 20 GB total | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

→ **18 combo** (3 loại GB × 6 variants ngày)

### Nhóm 3: Unlimited

| Loại | 7 ngày | 14 ngày | 21 ngày | 30 ngày | 60 ngày | 90 ngày |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Unlimited | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

→ **6 combo** (1 loại × 6 variants ngày)

---

## Tổng: 18 + 18 + 6 = **42 combo**

---

## Thuật Ngữ Quan Trọng

| Tình huống | Diễn đạt ĐÚNG | Diễn đạt SAI |
|---|---|---|
| GoHub chưa tạo SKU cho gói đó | "Cần request vendor tạo thêm SKU" | "Vendor không có hàng" |
| SKU active, bán được | "Có trong hệ thống GoHub" | "Có sẵn" (mơ hồ) |
| GoHub chưa tạo SKU | "Chưa có trong hệ thống GoHub" | "Hết hàng" |
| WM có gói, GoHub đã tạo SKU | "WM có, GoHub đã tạo" | — |
| WM có gói, GoHub chưa tạo SKU | "WM có, GoHub chưa tạo" | — |

---

## Vendor Priority Theo Nước

> Chi tiết đầy đủ: [[pricing/Vendor-Priority]]

| Nước / Khu vực | Vendor ưu tiên | Lý do |
|---|---|---|
| Hong Kong (HK) | **WM** | no-KYC, giá tốt |
| Đài Loan (TW) | **WM** | no-KYC, coverage tốt |
| Nhật Bản (JP) | **KDDI** | partnership riêng |
| Các nước khác | **3HK** trước | Phủ sóng rộng |
| BC / JY | Last resort | Khi WM + 3HK không có |

---

## Gap Analysis Flow

```
1. Lấy 42 combo chuẩn cho nước X
2. Kiểm tra SKU active trong GoHub DB (sku_catalog)
3. Kiểm tra WM catalog (ncc_worldmove, cột exist=Yes/No)
4. Output:
   - GoHub đã có: N/42 combo
   - WM có sẵn nhưng GoHub chưa tạo: M combo
   - WM không có: K combo → cần request vendor
```

> Web UI gap analysis: `/ncc` → tab WM → filter "Chưa có trong HT"
