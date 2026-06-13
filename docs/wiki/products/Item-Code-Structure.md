---
title: "Cấu Trúc Mã Item & Alias (18 ký tự)"
page_type: reference
department: all
tags: [item, alias, ma-hoa, kenh-ban, reference]
aliases: ["Item Code", "Mã Item", "Alias", "18 ký tự"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# Cấu Trúc Mã Item & Alias (18 ký tự)

## Sơ Đồ Tổng Quát

```
Pos:  1       2 3      4 5      6 → 18         (19-20 nếu có)
      ▼       ▼ ▼      ▼ ▼      ▼▼▼▼▼▼▼▼▼▼▼▼▼
      Channel Partner  Price    SKU Code        Number
                       list     (13 chars)      (2 chars)
```

**Ví dụ:** `BSP011CRUS12A00107AA`

```
B    SP    01    1CRUS12A00107    AA
▼    ▼     ▼     ▼▼▼▼▼▼▼▼▼▼▼▼▼  ▼▼
B2C  ShopeePay  Pricelist 01  SKU code  Số thứ tự
```

---

## Ký Tự 1 — Sales Channel

| Ký tự | Kênh | Mô tả |
|---|---|---|
| `B` | B2C | Bán trực tiếp tới người dùng |
| `D` | OD (On Demand) | Đặt hàng theo yêu cầu |
| `W` | WS (Wholesale) | Bán buôn cho đối tác |
| `I` | Internal | Nội bộ |

---

## Ký Tự 2-3 — Partner Code

| Mã | Partner | Kênh |
|---|---|---|
| `SP` | ShopeePay | B2C |
| `MM` | Momo | B2C |
| `ZP` | ZaloPay | B2C |
| `KK` | KKday | B2C / OD |
| `T1` | Tier 1 Wholesale | WS |
| `TV` | Traveloka | B2C / OD |

---

## Ký Tự 4-5 — Pricelist Code

2 ký tự số hoặc chữ = mã bảng giá áp dụng cho partner.

Mỗi partner có thể có nhiều bảng giá khác nhau (ví dụ: `01` = standard, `02` = premium).

---

## Ký Tự 6-18 — SKU Code (13 ký tự)

Đây chính là [[products/SKU-Code-Structure|mã SKU]] nhúng vào trong Item Code.

```
Item:  B SP 01 [1CRUS12A00107] AA
                ▲▲▲▲▲▲▲▲▲▲▲▲▲
                SKU Code (13 chars)
```

---

## Ký Tự 19-20 — Number (Số Thứ Tự)

Phân biệt các item của cùng 1 SKU trên cùng 1 channel/pricelist.

Ví dụ: `AA`, `AB`, `01`, `02`...

---

## Alias

**Alias = mã Item** — đây là mã gửi cho khách hàng và đối tác.

> **Cực kỳ quan trọng:** Alias được in-đậm `font-mono brand-700` trong UI và là mã duy nhất để tra cứu đơn hàng.

### Đặc điểm Alias
- Dài 18-20 ký tự
- Encode đầy đủ thông tin: channel + partner + pricelist + sản phẩm
- Dùng trong: đơn hàng, báo cáo, hỗ trợ khách hàng
- Tra cứu qua chatbot: nhập alias → hệ thống decode → hiện thông tin đầy đủ

---

## Ví Dụ Thực Tế

| Item Code | Giải mã |
|---|---|
| `BSP011CRUS12A00107AA` | B2C + ShopeePay + PL01 + SKU: VN/eSIM Full/Russia/WM/Daily 1GB/7 ngày |
| `WKK021CJPNKD D00107AB` | WS + KKday + PL02 + SKU: VN/eSIM Full/Japan/KDDI/Unlimited no throttle/7 ngày |

---

## Phân Biệt Các Loại Mã

| Mã | Độ dài | Dùng cho |
|---|---|---|
| **Product Code** | 8 ký tự | Nhóm sản phẩm cùng loại |
| **SKU Code** | 13 ký tự | Đơn vị nhập kho, tạo sản phẩm |
| **Listing Code** | Biến thiên | Tên sản phẩm trên từng kênh |
| **Item Code / Alias** | 18-20 ký tự | Đơn vị bán, tra cứu đơn hàng |

> Cấu trúc SKU: [[products/SKU-Code-Structure]]
