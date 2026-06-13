---
title: "Quy Tắc Chọn Vendor"
page_type: pricing_rule
department: product
tags: [vendor, priority, wm, 3hk, kddi, gap-analysis]
aliases: ["Vendor Priority", "Chọn Vendor", "Ưu tiên vendor"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# Quy Tắc Chọn Vendor

## Bảng Ưu Tiên Theo Nước

| Nước / Khu vực | Vendor ưu tiên | Lý do |
|---|---|---|
| **Hong Kong (HK)** | WM | no-KYC, giá cạnh tranh, coverage tốt |
| **Đài Loan (TW)** | WM | no-KYC, coverage tốt |
| **Nhật Bản (JP)** | KDDI | Partnership riêng, chất lượng cao |
| **Các nước khác** | 3HK trước, WM sau | 3HK phủ sóng rộng hơn |
| **BC / JY** | Last resort | Khi WM + 3HK + KDDI đều không có |

---

## Nguyên Tắc Tiebreak Giá

Khi nhiều vendor cùng có sản phẩm phù hợp:

1. **COGS thấp hơn** → ưu tiên
2. **Local > Regional > Global** — gói đặc thù cho nước đó tốt hơn gói khu vực
3. **no-KYC** luôn được ưu tiên nếu giá tương đương (giảm ma sát cho khách)

---

## Flowchart Chọn Vendor

```
Khách cần nước X
    │
    ├─ HK / TW? ──────────────────────→ WM (no-KYC)
    │
    ├─ Japan? ─────────────────────────→ KDDI
    │
    ├─ Nước khác?
    │       │
    │       ├─ 3HK có zone cho nước X? → 3HK (tính COGS formula)
    │       │
    │       ├─ WM có sản phẩm? ────────→ WM
    │       │
    │       └─ Cả 2 đều không có ──────→ BC / JY (last resort)
    │
    └─ Không vendor nào có ────────────→ "GoHub chưa có, cần request vendor"
```

---

## Phân Biệt "Thiếu" vs "Vendor Không Có"

| Tình huống | Diễn đạt đúng | Hành động |
|---|---|---|
| GoHub chưa tạo SKU nhưng WM có gói | **"Cần request vendor tạo thêm SKU"** | Tạo SKU trong hệ thống |
| WM không có gói phù hợp | "WM không có, thử 3HK" | Dùng 3HK + tính COGS |
| Cả WM + 3HK đều không có | "Chưa có trong GoHub ecosystem" | Liên hệ vendor mới |

> Thuật ngữ "thiếu" = **GoHub chưa tạo SKU**, không phải vendor hết hàng.

---

## Vendor Tiers

### Tier 1 — Đang hoạt động đầy đủ

| Vendor | Sản phẩm trong DB | Import data |
|---|---|---|
| WM (WorldMove) | 8,921 gói | ✅ Đầy đủ + APN |
| 3HK | 45 zones | ✅ Đầy đủ |

### Tier 2 — Defer (chưa import data)

| Vendor | Lý do defer |
|---|---|
| BillionConnect (BC) | Chưa có yêu cầu cụ thể |
| SimStore (SS) | Chưa có yêu cầu cụ thể |
| Viettel (VT) | Chưa có yêu cầu cụ thể |
| TruemovH (TM) | Chưa có yêu cầu cụ thể |
| KDDI | Partnership riêng, ít gói |

---

## Liên Quan

- [[vendors/WM-WorldMove]] — chi tiết WM
- [[vendors/3HK]] — chi tiết 3HK
- [[products/Combo-Chuan-GoHub]] — 42 combo chuẩn
- [[pricing/3HK-COGS-Formula]] — tính giá 3HK
