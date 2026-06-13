---
title: "Data Policy Codes (Mã Loại Data)"
page_type: reference
department: all
tags: [data-policy, sku, throttle, unlimited, reference]
aliases: ["Data Policy", "dataPolicyCode", "Mã Data Policy"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# Data Policy Codes

**Vị trí trong SKU:** Ký tự số 8 (sau 2 ký tự vendor).

> Ví dụ: `1CRUS12**A**00107` → `A` = Daily cap, throttle 10Mbps sau khi hết

---

## Bảng Mã Đầy Đủ

| Mã | Tên | Loại data | Hành vi sau hết quota | Throttle |
|---|---|---|---|---|
| `A` | Daily Unlimited 10M | Unlimited, cap theo ngày | Throttle 10 Mbps | 10 Mbps |
| `B` | Daily Unlimited 5M | Unlimited, cap theo ngày | Throttle 5 Mbps | 5 Mbps |
| `C` | Unlimited Fixed | Unlimited cố định | — | — |
| `D` | True Unlimited | Unlimited, không throttle | Không giới hạn | Không |
| `E` | Fixed→Unlimited 10M | Data cố định + unlimited sau | Throttle 10 Mbps | 10 Mbps |
| `F` | Fixed Throttle | Data cố định | Throttle nhẹ | < 2 Mbps |
| `G` | Fixed→Unlimited 5M | Data cố định + unlimited sau | Throttle 5 Mbps | 5 Mbps |
| `H` | Unlimited Fixed v2 | Unlimited cố định | — | — |
| `K` | Frame/Profile | Không có data | — | — |
| `P` | Daily Throttle | Data cấp theo ngày | Throttle 128 kbps | 128 kbps |
| `Y` | No Throttle v1 | Data cố định, no throttle | Không throttle | Không |
| `Z` | No Throttle v2 | Data cố định, no throttle | Không throttle | Không |

---

## Phân Loại Theo Nhóm

### Unlimited (Không giới hạn tổng)

```
D  → True Unlimited (Titanium AYCE) — không throttle bao giờ
A  → Daily 1GB highspeed → throttle 10 Mbps (WM Premium Unlimited)
B  → Daily 2GB highspeed → throttle 5 Mbps (WM Standard Unlimited)
C  → Unlimited cố định
H  → Unlimited cố định v2
```

### Fixed Data (Dung lượng cố định)

```
F  → Fixed data → throttle 128 kbps sau hết
P  → Daily data → throttle 128 kbps sau hết quota ngày
E  → Fixed cap → throttle 10 Mbps (unlimited tiếp tục nhưng chậm)
G  → Fixed cap → throttle 5 Mbps
Y  → Fixed data, không throttle bao giờ
Z  → Fixed data, không throttle v2
```

### Đặc biệt

```
K  → Frame/Profile SKU — không có data thực, chỉ là template
```

---

## Mapping WM Product Type → Data Policy Code

| Loại gói WM | Data Policy Code |
|---|---|
| Titanium AYCE | `D` |
| Premium Unlimited (1GB/d highspeed) | `A` |
| Standard Unlimited (2GB/d highspeed) | `B` |
| Fixed Data | `F` |
| Daily Data | `P` |

---

## Auto-Derive Logic (trong Template Creator)

Hệ thống tự động đề xuất `dataPolicyCode` khi tạo template từ WM products:

```
if is_unlimited AND throttle = null  → D
if is_unlimited AND throttle = 10    → A
if is_unlimited AND throttle = 5     → B
if is_unlimited AND throttle = 0.128 → P
if is_daily (not unlimited)          → P
if fixed (not daily, not unlimited)  → F
```

---

## Liên Quan

- [[products/SKU-Code-Structure#Ký Tự 8 — Data Policy Code|SKU Code → ký tự 8]]
- [[vendors/WM-WorldMove#Loại Gói (Product Types)|WM Product Types]]
- [[pricing/3HK-COGS-Formula|3HK COGS Formula (dùng phân loại Fixed/Daily/Unlimited)]]
