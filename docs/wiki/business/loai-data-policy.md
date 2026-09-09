---
title: "Data Policy Codes (Mã Loại Data)"
page_type: reference
department: all
audience: cs-product
visibility: all
tags: [data-policy, sku, throttle, unlimited, reference, tu-van]
aliases: ["Data Policy", "Mã Data Policy", "Data Policy Code"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-04
status: active
---

# Data Policy Codes

Mã data policy nằm ở ký tự số 8 trong mã SKU, ngay sau hai ký tự vendor. Ví dụ trong `1CRUS12A00107`, ký
tự `A` (vị trí thứ 8) nghĩa là Daily cap, tốc độ tối thiểu 10 Mbps sau khi hết quota ngày.

## Danh sách đầy đủ

`A` (Daily 10M) là loại không giới hạn, cap theo ngày, tốc độ sau hết quota tối thiểu 10 Mbps. `B` (Daily
5M) tương tự nhưng tốc độ tối thiểu 5 Mbps. `C` (Unlimited cố định) là không giới hạn, không có mốc giảm
tốc ghi rõ. `D` (True Unlimited) là không giới hạn và không bao giờ giảm tốc. `E` (Fixed + 10M) là data cố
định, sau đó chuyển sang không giới hạn ở tối thiểu 10 Mbps. `F` (Fixed chậm) là data cố định, sau hết thì
giảm xuống dưới 2 Mbps. `G` (Fixed + 5M) là data cố định, sau đó không giới hạn ở tối thiểu 5 Mbps. `H`
(Unlimited cố định, biến thể 2) tương tự `C`. `K` (Mã khung/Profile) không có data thật, chỉ dùng cho
eSIM profile hoặc SIM frame. `P` (Daily chậm) là data cấp theo ngày, sau hết quota ngày giảm còn 128 kbps.
`Y` (Fixed không throttle) là data cố định, không bao giờ giảm tốc. `Z` (Fixed không throttle, biến thể
2) tương tự `Y`.

## Phân loại theo nhóm

Nhóm Không giới hạn (Unlimited) gồm: `D` là True Unlimited (tương ứng gói Titanium AYCE), không bao giờ
giảm tốc; `A` cấp 1GB tốc độ cao mỗi ngày rồi giảm về tối thiểu 10 Mbps (tương ứng WM Premium Unlimited);
`B` cấp 2GB tốc độ cao mỗi ngày rồi giảm về tối thiểu 5 Mbps (tương ứng WM Standard Unlimited); `C` và `H`
là hai biến thể của Unlimited cố định.

Nhóm Data cố định (Fixed) gồm: `F` là data cố định, tốc độ rất chậm sau khi hết; `P` là data cấp theo
ngày, tốc độ rất chậm sau khi hết quota ngày; `E` là data cố định, sau đó không giới hạn ở tối thiểu 10
Mbps; `G` tương tự nhưng ở tối thiểu 5 Mbps; `Y` là data cố định không bao giờ giảm tốc; `Z` là biến thể
thứ hai của `Y`.

Nhóm Đặc biệt chỉ có `K`, dùng cho mã khung hoặc profile — không có data thực, chỉ là template hoặc hồ sơ.

## Mapping loại gói WM sang data policy

Gói Titanium AYCE tương ứng mã `D`. Gói Premium Unlimited (1GB/ngày tốc độ cao) tương ứng mã `A`. Gói
Standard Unlimited (2GB/ngày tốc độ cao) tương ứng mã `B`. Gói Fixed Data tương ứng mã `F`. Gói Daily Data
tương ứng mã `P`.

## Xác định mã data policy khi tạo sản phẩm mới

Nếu gói vendor không giới hạn và không bao giờ giảm tốc, dùng mã `D`. Nếu không giới hạn nhưng giảm xuống
10 Mbps sau quota, dùng mã `A`. Nếu giảm xuống 5 Mbps sau quota, dùng mã `B`. Nếu giảm xuống 128 kbps sau
quota, dùng mã `P`. Nếu data cấp theo ngày mà không phải unlimited, cũng dùng mã `P`. Nếu data tổng cố
định — không theo ngày, không unlimited — dùng mã `F`.

Xem thêm phần ký tự 8 trong bài [[ma-sku|Cấu Trúc Mã SKU]], mục các loại gói trong bài
[[vendor-worldmove|WorldMove]], và cách phân loại Fixed/Daily/Unlimited trong bài
[[cong-thuc-gia-3hk|Công thức 3HK]].
