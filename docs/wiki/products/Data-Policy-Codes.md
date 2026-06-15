---
title: "Data Policy Codes (Mã Loại Data)"
page_type: reference
department: all
tags: [data-policy, sku, throttle, unlimited, reference]
aliases: ["Data Policy", "Mã Data Policy", "Data Policy Code"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# Data Policy Codes

**Vị trí trong SKU:** Ký tự số 8 (sau 2 ký tự vendor).

> Ví dụ: `1CRUS12**A**00107` → `A` = Daily cap, tốc độ tối thiểu 10 Mbps sau khi hết quota ngày

---

## Bảng Mã Đầy Đủ

| Mã | Tên | Loại data | Tốc độ sau hết quota |
|---|---|---|---|
| `A` | Daily 10M | Không giới hạn, cap theo ngày | Tối thiểu 10 Mbps |
| `B` | Daily 5M | Không giới hạn, cap theo ngày | Tối thiểu 5 Mbps |
| `C` | Unlimited cố định | Không giới hạn | — |
| `D` | True Unlimited | Không giới hạn, không giảm tốc | Không giới hạn |
| `E` | Fixed + 10M | Data cố định, sau đó không giới hạn | Tối thiểu 10 Mbps |
| `F` | Fixed chậm | Data cố định | Dưới 2 Mbps |
| `G` | Fixed + 5M | Data cố định, sau đó không giới hạn | Tối thiểu 5 Mbps |
| `H` | Unlimited cố định v2 | Không giới hạn | — |
| `K` | Mã khung / Profile | Không có data | — |
| `P` | Daily chậm | Data cấp theo ngày | 128 kbps |
| `Y` | Fixed không throttle | Data cố định, không giảm tốc | Không giới hạn |
| `Z` | Fixed không throttle v2 | Data cố định, không giảm tốc | Không giới hạn |

---

## Phân Loại Theo Nhóm

### Không giới hạn (Unlimited)

```
D  → True Unlimited (Titanium AYCE) — không bao giờ giảm tốc
A  → 1 GB tốc độ cao/ngày → tối thiểu 10 Mbps  (WM Premium Unlimited)
B  → 2 GB tốc độ cao/ngày → tối thiểu 5 Mbps   (WM Standard Unlimited)
C  → Unlimited cố định
H  → Unlimited cố định (biến thể 2)
```

### Data cố định (Fixed)

```
F  → Data cố định → tốc độ rất chậm sau hết
P  → Data theo ngày → tốc độ rất chậm sau hết quota ngày
E  → Data cố định → tối thiểu 10 Mbps (không giới hạn tiếp theo)
G  → Data cố định → tối thiểu 5 Mbps (không giới hạn tiếp theo)
Y  → Data cố định, không giảm tốc bao giờ
Z  → Data cố định, không giảm tốc (biến thể 2)
```

### Đặc biệt

```
K  → Mã khung / Profile — không có data thực, chỉ là template/hồ sơ
```

---

## Mapping Loại Gói WM → Data Policy

| Loại gói WM | Data Policy |
|---|---|
| Titanium AYCE | `D` |
| Premium Unlimited (1 GB/ngày tốc độ cao) | `A` |
| Standard Unlimited (2 GB/ngày tốc độ cao) | `B` |
| Fixed Data | `F` |
| Daily Data | `P` |

---

## Cách Tự Xác Định Data Policy Khi Tạo Sản Phẩm

```
Không giới hạn + không throttle          → D
Không giới hạn + throttle 10 Mbps        → A
Không giới hạn + throttle 5 Mbps         → B
Không giới hạn + throttle 128 kbps       → P
Data theo ngày (không unlimited)          → P
Data cố định (không daily, không unlim)  → F
```

---

## Liên Quan

- [[products/SKU-Code-Structure#Ký Tự 8 — Loại Data|SKU Code → ký tự 8]]
- [[vendors/WM-WorldMove#Các Loại Gói WM|WM — Loại gói]]
- [[pricing/3HK-COGS-Formula|Công thức 3HK (dùng phân loại Fixed / Daily / Unlimited)]]
