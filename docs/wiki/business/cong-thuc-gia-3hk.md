---
title: "Công Thức Tính Giá Nhập — 3HK"
page_type: pricing_rule
department: finance
audience: cs-product
visibility: all
tags: [3hk, cogs, formula, pricing, zone, product]
aliases: ["3HK COGS", "Công thức 3HK", "3HK Formula"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-04
status: active
---

# Công Thức Tính Giá Nhập — 3HK

3HK tính phí theo dung lượng thực tế tiêu thụ, không phải theo gói danh nghĩa. Vì người dùng thường không
dùng hết 100% dung lượng đã mua, GoHub dùng hệ số thực tế để ước tính giá nhập.

## Hệ số theo loại gói

Fixed Data dùng hệ số 55%, tức GB thực bằng GB gói nhân 0.55. Daily Data dùng hệ số 40%, tức GB thực bằng
GB mỗi ngày nhân số ngày rồi nhân 0.40. Unlimited 10 Mbps coi như dùng 100% ở mức 1.8 GB mỗi ngày, tức GB
thực bằng 1.8 nhân số ngày. Unlimited 5 Mbps coi như dùng 100% ở mức 1.6 GB mỗi ngày, tức GB thực bằng 1.6
nhân số ngày.

## Công thức đầy đủ theo ba bước

Bước một, tính GB thực: với gói Fixed, GB thực bằng dung lượng gói nhân 0.55; với gói Daily, GB thực bằng
GB mỗi ngày nhân số ngày rồi nhân 0.40; với Unlimited 10 Mbps, GB thực bằng 1.8 nhân số ngày; với
Unlimited 5 Mbps, GB thực bằng 1.6 nhân số ngày.

Bước hai, tra giá vùng theo HKD mỗi GB: khu vực Châu Á 12 nước giá 5 HKD/GB, khu vực Châu Âu và Mỹ giá 7
HKD/GB, khu vực Úc và New Zealand giá 6.5 HKD/GB. Danh sách vùng đầy đủ xem ở bài [[vendor-3hk|3HK]], mục
Vùng phủ sóng và giá.

Bước ba, tính giá nhập: giá nhập HKD bằng GB thực nhân giá mỗi GB; giá nhập USD bằng giá nhập HKD chia
7.798; giá nhập VND bằng giá nhập USD nhân 26.394. Tỷ giá xem thêm ở bài [[ty-gia|Tỷ Giá Nội Bộ]].

## Ví dụ tính toán

Ví dụ một: gói Fixed 10 GB đi Nhật Bản (vùng 5 HKD/GB). GB thực bằng 10 nhân 0.55 bằng 5.5 GB. Giá nhập
HKD bằng 5.5 nhân 5 bằng 27.5 HKD. Giá nhập USD bằng 27.5 chia 7.798 bằng 3.53 USD. Giá nhập VND bằng
3.53 nhân 26.394 bằng 93.050 VND.

Ví dụ hai: gói Daily 2 GB mỗi ngày trong 30 ngày, đi Châu Âu (vùng 7 HKD/GB). GB thực bằng
2 × 30 × 0.40 bằng 24 GB. Giá nhập HKD bằng 24 nhân 7 bằng 168 HKD. Giá nhập USD bằng 168 chia 7.798 bằng
21.54 USD. Giá nhập VND bằng 21.54 nhân 26.394 bằng 568.625 VND.

Ví dụ ba: gói Unlimited 10 Mbps trong 7 ngày, đi Singapore (vùng 5 HKD/GB). GB thực bằng 1.8 nhân 7 bằng
12.6 GB. Giá nhập HKD bằng 12.6 nhân 5 bằng 63 HKD. Giá nhập USD bằng 63 chia 7.798 bằng 8.08 USD. Giá
nhập VND bằng 8.08 nhân 26.394 bằng 213.264 VND.

## Lưu ý sử dụng

3HK là nguồn tham khảo để tạo sản phẩm, không phải gói GoHub đang bán trực tiếp cho khách. Tính giá nhập
thực tế là việc của team Product khi tạo SKU mới, dùng công thức này trong ba trường hợp: tạo SKU mới từ
catalog 3HK, so sánh giá WM với 3HK cho cùng nước hoặc cùng loại gói, và kiểm tra lợi nhuận trước khi đưa
sản phẩm lên kênh bán.

## Điều chỉnh hệ số

Hai hệ số 55% và 40%, cùng hai mức 1.8 và 1.6 GB, có thể chỉnh trực tiếp tại web mục Admin, Cài đặt, phần
Công thức 3HK Datapool. Thay đổi có hiệu lực ngay khi lưu.
