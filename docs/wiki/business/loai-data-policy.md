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
updated: 2026-09-22
status: active
---

# Data Policy Codes

Mã data policy nằm ở ký tự số 8 trong mã SKU (bộ mã chuẩn 13 ký tự), ngay sau hai ký tự vendor.

> ⚠️ **Đã sửa 2026-09-22**: bảng dưới đây trước ghi sai nghĩa nhiều ký tự (đặc biệt `E`/`G` bị đảo ngược
> tốc độ, thiếu hẳn `L`/`X`/`T`). Đã sửa lại theo bảng đã verify trực tiếp qua SQL trên `fact_data_usage`
> thật (khớp tuyệt đối, xem `system/tabs/analytics-3hk-usage.md` §3.1). Quy tắc chốt: **hễ tên gọi có chữ
> "Unlimited" → LUÔN xếp Unlimited**, dù kèm chữ "Daily" hay "Fixed" — hai chữ đó chỉ nói chu kỳ RESET của
> mức throttle, không nói bản chất có giới hạn dung lượng hay không.

## Danh sách đầy đủ

`A` (Daily - Unlimited 5mbps) là Unlimited, tốc độ cao hết quota ngày thì giảm về 5 Mbps. `B` (Daily -
Unlimited 10mbps) tương tự nhưng giảm về 10 Mbps. `C` (Unlimited 20mbps) là Unlimited, giảm về 20 Mbps.
`D` (Unlimited 100mbps) là True Unlimited, tốc độ cao nhất, gần như không giảm. `E` (Fixed - Unlimited
5mbps) là Unlimited, giảm về 5 Mbps. `G` (Fixed - Unlimited 10mbps) là Unlimited, giảm về 10 Mbps. `H`
(Unlimited 5mbps) là Unlimited, giảm về 5 Mbps — biến thể khác của `A`/`E`. `L` (Unlimited 50mbps) là
Unlimited, giảm về 50 Mbps. `X` (Daily Unlimited 10mbps - Midnight) là Unlimited, reset mốc throttle lúc
nửa đêm. `F` (Fixed throttle <2mbps) là data cố định, hết quota giảm xuống dưới 2 Mbps. `Y` (Fixed
no-throttle) là data cố định, hết quota vẫn giữ tốc độ bình thường. `P` (Daily throttle <2mbps) là data
cấp theo ngày, hết quota ngày giảm xuống dưới 2 Mbps. `Z` (Daily no-throttle) là data cấp theo ngày, hết
quota ngày vẫn giữ tốc độ bình thường. `T` (Daily throttle <2mbps - Midnight) giống `P` nhưng reset lúc
nửa đêm. `K` (Mã khung/Profile) không có data thật, chỉ dùng cho eSIM profile hoặc SIM frame — phải LOẠI
HẲN khỏi mọi báo cáo doanh thu/usage.

## Phân loại theo nhóm

Nhóm Unlimited gồm: `A`, `B`, `C`, `D`, `E`, `G`, `H`, `L`, `X` — chín mã này đều là gói không giới hạn
dung lượng, chỉ khác nhau ở tốc độ/mốc giảm tốc sau khi vượt ngưỡng tiêu dùng cao trong ngày (`D` là True
Unlimited, gần như không giảm; các mã còn lại giảm về mức 5/10/20/50 Mbps).

Nhóm Fixed (data cố định, hết là hết) gồm `F` (giảm xuống dưới 2 Mbps sau khi hết) và `Y` (giữ nguyên tốc
độ sau khi hết).

Nhóm Daily (cấp lại mỗi ngày, reset theo ngày) gồm `P` (giảm xuống dưới 2 Mbps sau khi hết quota ngày),
`Z` (giữ nguyên tốc độ), và `T` (giống `P`, reset lúc nửa đêm).

Nhóm Đặc biệt chỉ có `K`, dùng cho mã khung hoặc profile — không có data thực, chỉ là template hoặc hồ sơ,
không tính vào bất kỳ nhóm Daily/Fixed/Unlimited nào.

## Mapping loại gói WM sang data policy

Gói Titanium AYCE (True Unlimited) tương ứng mã `D`. Gói Premium Unlimited (1GB/ngày tốc độ cao) tương
ứng mã `A`. Gói Standard Unlimited (2GB/ngày tốc độ cao) tương ứng mã `B`. Gói Fixed Data tương ứng mã
`F`. Gói Daily Data tương ứng mã `P`.

## Xác định mã data policy khi tạo sản phẩm mới

Nếu gói vendor không giới hạn, dùng nhóm Unlimited (`A`/`B`/`C`/`D`/`E`/`G`/`H`/`L`/`X` tuỳ tốc độ/mốc
giảm tốc — xem bảng trên). Nếu data tổng cố định, không theo ngày, dùng `F` (giảm tốc mạnh) hoặc `Y` (giữ
tốc độ). Nếu data cấp theo ngày mà không phải unlimited, dùng `P` (giảm tốc mạnh), `Z` (giữ tốc độ), hoặc
`T` (giống `P`, reset nửa đêm).

## Lưu ý mã SKU CŨ (14 ký tự)

Với mã cũ 14 ký tự còn sót trong lịch sử, ký tự quyết định loại gói nằm ở **vị trí 10** (không phải vị trí
8), và ý nghĩa từng chữ cái KHÁC hẳn bộ 13 ký tự ở trên — ví dụ `P` ở vị trí 10 của mã cũ lại là Unlimited
(nằm trong token `UNLIP1`/`UNLIP2`), trái ngược `P` ở vị trí 8 của mã mới (Daily). Đừng áp bảng trên cho
mã 14 ký tự.

Xem thêm phần ký tự 8 trong bài [[ma-sku|Cấu Trúc Mã SKU]], mục các loại gói trong bài
[[vendor-worldmove|WorldMove]], và cách phân loại Fixed/Daily/Unlimited trong bài
[[cong-thuc-gia-3hk|Công thức 3HK]].
