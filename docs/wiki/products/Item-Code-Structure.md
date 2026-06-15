---
title: "Cấu Trúc Mã Item & Alias (18–20 ký tự)"
page_type: reference
department: all
tags: [item, alias, ma-hoa, kenh-ban, reference]
aliases: ["Item Code", "Mã Item", "Alias", "18 ký tự"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# Cấu Trúc Mã Item & Alias (18–20 ký tự)

Mã Item (hay còn gọi là **Alias**) là mã định danh sản phẩm trên từng kênh bán. Đây là mã GoHub gửi cho khách hàng và đối tác để tra cứu đơn hàng.

## Tổng Quan Cấu Trúc

| Vị trí | 1 | 2–3 | 4–5 | 6–18 | 19–20 |
|---|---|---|---|---|---|
| **Ý nghĩa** | Kênh bán | Đối tác | Bảng giá | Mã SKU (13 ký tự) | Số thứ tự |

---

## Ví Dụ Giải Mã: `BSP011CRUS12A00107AA`

| Phần | Ký tự | Ý nghĩa |
|---|---|---|
| Kênh | `B` | B2C — bán lẻ trực tiếp |
| Đối tác | `SP` | ShopeePay |
| Bảng giá | `01` | Bảng giá số 01 |
| Mã SKU | `1CRUS12A00107` | VN / eSIM Full / Nga / WM / Daily 1GB / 7 ngày |
| Số thứ tự | `AA` | Phân biệt các item cùng SKU trên cùng kênh |

---

## Ký Tự 1 — Kênh Bán

| Ký tự | Kênh | Mô tả |
|---|---|---|
| `B` | B2C | Bán lẻ trực tiếp tới người dùng |
| `D` | OD (On Demand) | Đặt hàng theo yêu cầu |
| `W` | WS (Wholesale) | Bán buôn cho đối tác |
| `I` | Internal | Nội bộ |

---

## Ký Tự 2–3 — Đối Tác (Partner)

| Mã | Đối tác | Kênh |
|---|---|---|
| `SP` | ShopeePay | B2C |
| `MM` | Momo | B2C |
| `ZP` | ZaloPay | B2C |
| `KK` | KKday | B2C / OD |
| `T1` | Tier 1 Wholesale | WS |
| `TV` | Traveloka | B2C / OD |

---

## Ký Tự 4–5 — Bảng Giá (Pricelist)

2 ký tự số hoặc chữ = mã bảng giá áp dụng cho đối tác đó.

Mỗi đối tác có thể có nhiều bảng giá khác nhau (ví dụ `01` = tiêu chuẩn, `02` = ưu đãi đặc biệt).

---

## Ký Tự 6–18 — Mã SKU (13 ký tự)

Phần này chính là mã SKU nhúng vào trong mã Item. Tra cứu ý nghĩa từng ký tự tại: [[products/SKU-Code-Structure]]

---

## Ký Tự 19–20 — Số Thứ Tự

Phân biệt các item của cùng một SKU trên cùng kênh/bảng giá.

Ví dụ: `AA`, `AB`, `01`, `02`...

---

## Alias là gì?

**Alias = Mã Item** — đây là mã gửi cho khách hàng và đối tác khi đặt hàng, dùng để tra cứu và xử lý đơn.

### Đặc điểm

- Dài 18–20 ký tự
- Chứa đầy đủ thông tin: kênh + đối tác + bảng giá + sản phẩm
- Dùng trong đơn hàng, báo cáo, và hỗ trợ khách hàng
- Nhập alias vào hệ thống → tra được toàn bộ thông tin sản phẩm và đơn hàng

---

## Ví Dụ Thực Tế

| Alias | Giải mã |
|---|---|
| `BSP011CRUS12A00107AA` | B2C + ShopeePay + Bảng giá 01 + eSIM Full Nga 1GB/ngày 7 ngày (VN) |
| `WKK021CJPNKDD00107AB` | WS + KKday + Bảng giá 02 + eSIM Full Nhật True Unlimited 7 ngày (VN) |

---

## Phân Biệt Các Loại Mã

| Mã | Độ dài | Mục đích |
|---|---|---|
| **Product Code** | 8 ký tự | Nhóm sản phẩm cùng loại (cùng nước, vendor, loại data) |
| **SKU Code** | 13 ký tự | Đơn vị nhập kho, tạo sản phẩm — phân biệt dung lượng và số ngày |
| **Listing Code** | Biến thiên | Tên sản phẩm hiển thị trên từng kênh |
| **Item Code / Alias** | 18–20 ký tự | Đơn vị bán — gắn với kênh và đối tác cụ thể |

> Cấu trúc SKU: [[products/SKU-Code-Structure]]
