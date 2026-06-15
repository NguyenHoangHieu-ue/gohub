---
title: "Quy Tắc Chọn Vendor"
page_type: pricing_rule
department: product
tags: [vendor, priority, wm, 3hk, kddi, gap-analysis]
aliases: ["Vendor Priority", "Chọn Vendor", "Ưu tiên vendor"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# Quy Tắc Chọn Vendor

## Ưu Tiên Theo Nước

| Nước / Khu vực | Vendor ưu tiên | Lý do |
|---|---|---|
| **Hồng Kông** | WM | Không cần KYC, giá cạnh tranh, phủ sóng tốt |
| **Đài Loan** | WM | Không cần KYC, phủ sóng tốt |
| **Nhật Bản** | KDDI | Partnership riêng, chất lượng cao |
| **Các nước khác** | 3HK trước, WM sau | 3HK phủ sóng rộng hơn |
| **BC / JY** | Phương án cuối | Khi WM, 3HK và KDDI đều không có |

---

## Nguyên Tắc Chọn Khi Có Nhiều Vendor

Khi nhiều vendor cùng có sản phẩm phù hợp, ưu tiên theo thứ tự:

1. **Giá nhập thấp hơn** → ưu tiên
2. **Gói đặc thù cho nước đó > Gói khu vực > Gói toàn cầu** — gói càng cụ thể thì chất lượng và giá thường tốt hơn
3. **Không cần KYC** → ưu tiên nếu giá tương đương (giảm ma sát cho khách hàng)

---

## Sơ Đồ Chọn Vendor

**Nước cần triển khai là HK hoặc TW?**
→ Dùng WM (không cần KYC)

**Nước cần triển khai là Nhật?**
→ Dùng KDDI

**Nước khác:**
- 3HK có vùng giá cho nước đó? → Dùng 3HK (tính giá theo công thức)
- WM có sản phẩm? → Dùng WM
- Cả hai đều không có → BC / JY (phương án cuối)
- Không vendor nào có → Ghi nhận và liên hệ vendor mới

---

## Phân Biệt "Thiếu" và "Vendor Không Có"

| Tình huống | Cách diễn đạt đúng | Hành động |
|---|---|---|
| GoHub chưa tạo SKU nhưng WM có gói | **"Cần tạo thêm SKU trong hệ thống"** | Tạo SKU |
| WM không có gói phù hợp | "WM không có, thử 3HK" | Dùng 3HK + tính giá |
| Cả WM và 3HK đều không có | "GoHub chưa có sản phẩm cho nước này" | Liên hệ vendor mới |

> Thuật ngữ "thiếu" = **GoHub chưa tạo SKU**, không phải vendor hết hàng hay không cung cấp.

---

## Phân Cấp Vendor

### Tier 1 — Đang hoạt động đầy đủ

| Vendor | Số sản phẩm | Dữ liệu |
|---|---|---|
| WM (WorldMove) | 8.921 gói | Đầy đủ, có thông tin APN |
| 3HK | 45 vùng giá | Đầy đủ |

### Tier 2 — Chưa triển khai

| Vendor | Lý do |
|---|---|
| BillionConnect (BC) | Chưa có nhu cầu cụ thể |
| SimStore (SS) | Chưa có nhu cầu cụ thể |
| Viettel (VT) | Chưa có nhu cầu cụ thể |
| TruemovH (TM) | Chưa có nhu cầu cụ thể |
| KDDI | Partnership riêng, số lượng gói ít |

---

## Liên Quan

- [[vendors/WM-WorldMove]] — chi tiết WM
- [[vendors/3HK]] — chi tiết 3HK
- [[products/Combo-Chuan-GoHub]] — 42 combo chuẩn
- [[pricing/3HK-COGS-Formula]] — tính giá 3HK
