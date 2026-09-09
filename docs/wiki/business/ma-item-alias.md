---
title: "Cấu Trúc Mã Item & Alias (18–20 ký tự)"
page_type: reference
department: all
tags: [item, alias, ma-hoa, kenh-ban, reference]
aliases: ["Item Code", "Mã Item", "Alias", "18 ký tự"]
created: 2026-06-13
updated: 2026-09-04
status: active
---

# Cấu Trúc Mã Item & Alias (18–20 ký tự)

Mã Item, còn gọi là Alias, là mã định danh sản phẩm trên từng kênh bán. Đây là mã GoHub gửi cho khách hàng
và đối tác để tra cứu đơn hàng. Cấu trúc gồm năm phần theo trình tự: ký tự đầu tiên là kênh bán, hai ký tự
tiếp theo (vị trí 2-3) là mã đối tác, hai ký tự kế (vị trí 4-5) là mã bảng giá, mười ba ký tự tiếp theo
(vị trí 6-18) chính là mã SKU nhúng vào, và hai ký tự cuối (vị trí 19-20) là số thứ tự phân biệt.

Ví dụ giải mã `BSP011CRUS12A00107AA`: kênh là `B`, tức B2C bán lẻ trực tiếp; đối tác là `SP`, tức
ShopeePay; bảng giá là `01`; mã SKU nhúng bên trong là `1CRUS12A00107`, giải mã ra VN, eSIM Full, nước
Nga, vendor WM, Daily 1GB, thời hạn 7 ngày; số thứ tự là `AA`, dùng để phân biệt các item cùng SKU trên
cùng kênh.

## Ký tự 1 — Kênh bán

`B` là B2C, bán lẻ trực tiếp tới người dùng. `D` là OD (On Demand), đặt hàng theo yêu cầu. `W` là WS
(Wholesale), bán buôn cho đối tác. `I` là Internal, dùng nội bộ.

## Ký tự 2–3 — Mã đối tác

`SP` là ShopeePay (kênh B2C). `MM` là Momo (B2C). `ZP` là ZaloPay (B2C). `KK` là KKday (B2C/OD). `T1` là
Tier 1 Wholesale (WS). `TV` là Traveloka (B2C/OD).

## Ký tự 4–5 — Bảng giá (Pricelist)

Hai ký tự số hoặc chữ, là mã bảng giá áp dụng cho đối tác đó. Mỗi đối tác có thể có nhiều bảng giá khác
nhau — ví dụ `01` là bảng giá tiêu chuẩn, `02` là bảng giá ưu đãi đặc biệt.

## Ký tự 6–18 — Mã SKU

Phần này chính là mã SKU 13 ký tự nhúng nguyên vào trong mã Item. Cách đọc ý nghĩa từng ký tự xem ở bài
[[ma-sku|Cấu Trúc Mã SKU]].

## Ký tự 19–20 — Số thứ tự

Dùng để phân biệt các item của cùng một SKU trên cùng kênh và cùng bảng giá — ví dụ `AA`, `AB`, `01`,
`02`.

## Alias là gì

Alias chính là Mã Item — mã gửi cho khách hàng và đối tác khi đặt hàng, dùng để tra cứu và xử lý đơn. Mã
này dài từ 18 đến 20 ký tự, chứa đầy đủ thông tin kênh, đối tác, bảng giá, và sản phẩm. Alias xuất hiện
trong đơn hàng, báo cáo, và khi hỗ trợ khách hàng — nhập alias vào hệ thống là tra được toàn bộ thông tin
sản phẩm và đơn hàng liên quan.

Hai ví dụ thực tế: `BSP011CRUS12A00107AA` giải mã là B2C, đối tác ShopeePay, bảng giá 01, sản phẩm eSIM
Full nước Nga 1GB/ngày trong 7 ngày (thuộc pháp nhân VN). `WKK021CJPNKDD00107AB` giải mã là WS, đối tác
KKday, bảng giá 02, sản phẩm eSIM Full nước Nhật True Unlimited trong 7 ngày (thuộc pháp nhân VN).

## Phân biệt các loại mã

Product Code dài 8 ký tự, nhóm sản phẩm cùng loại theo nước, vendor, và loại data. SKU Code dài 13 ký tự,
là đơn vị nhập kho và tạo sản phẩm, phân biệt theo dung lượng và số ngày. Listing Code có độ dài biến
thiên, là tên sản phẩm hiển thị trên từng kênh. Item Code (Alias) dài 18-20 ký tự, là đơn vị bán, gắn với
kênh và đối tác cụ thể. Xem thêm bài [[ma-sku|Cấu trúc SKU]].
