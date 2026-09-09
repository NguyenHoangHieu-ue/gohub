---
title: "Định Giá Gói FUP Tùy Chỉnh 3HK"
page_type: pricing_rule
department: product
tags: [3hk, cogs, formula, pricing, custom, fup, throttle]
aliases: ["3HK FUP", "Gói FUP 3HK", "Custom throttle pricing", "FUP pricing"]
created: 2026-06-15
updated: 2026-09-04
status: active
---

# Định Giá Gói FUP Tùy Chỉnh 3HK

Bài này hướng dẫn cách tính chi phí và xây dựng mức giá bán cho các gói có cấu trúc "X GB tốc độ cao mỗi
ngày, hết quota thì chuyển sang Y GB FUP ở tốc độ Z Mbps mỗi ngày". Khác với gói unlimited throttle (giảm
tốc vô hạn sau quota), FUP là một dung lượng cố định thứ hai — dùng hết cả phần tốc độ cao lẫn phần FUP
thì dừng hẳn hoặc cắt về 128 kbps. Công thức gốc 3HK xem ở bài [[cong-thuc-gia-3hk|Công Thức Tính Giá Nhập
3HK]].

## Vì sao FUP cố định tốt hơn unlimited throttle

So với unlimited throttle, FUP cố định có chi phí 3HK giới hạn và dự đoán được, trong khi unlimited
throttle không có trần và biến động. Trải nghiệm khách với FUP rõ ràng — khách biết còn bao nhiêu dung
lượng — trong khi unlimited throttle mờ hơn, khách không biết đang dùng bao nhiêu. Định giá với FUP chính
xác hơn, còn unlimited throttle phải ước tính hệ số tiêu thụ. Kiểm soát margin với FUP cũng dễ hơn, trong
khi unlimited throttle có rủi ro nếu hệ số ước tính sai.

## Công thức tính chi phí (COGS)

Trước tiên tính GB mỗi ngày bằng tổng của hai phần: cap tốc độ cao nhân hệ số sử dụng tốc độ cao, cộng cap
FUP nhân hệ số sử dụng FUP. Sau đó COGS tổng theo HKD bằng GB mỗi ngày nhân số ngày nhân giá vùng (HKD mỗi
GB). COGS theo USD bằng COGS tổng chia 7.798, và COGS theo VND bằng COGS USD nhân 26.394.

## Hệ số sử dụng phần tốc độ cao

Nếu cap mỗi ngày từ 1 GB trở xuống, hệ số là 90% vì dễ đạt giới hạn, nhất là những ngày dùng nhiều. Nếu
cap từ 1 đến 2 GB, hệ số là 85% vì hầu hết người dùng chạm giới hạn. Nếu cap từ 2 đến 3 GB, hệ số là 80%
vì một phần người dùng không đạt limit. Nếu cap trên 3 GB, hệ số là 70% vì khá nhiều người dùng không dùng
hết.

## Hệ số sử dụng phần FUP

Phần FUP chỉ kích hoạt khi người dùng đã dùng hết phần tốc độ cao — tức là người có nhu cầu cao và đang
cần thêm data — nên tỷ lệ sử dụng FUP cao hơn cap tốc độ cao cùng kích thước.

Với FUP cap từ 1 GB trở xuống: ở tốc độ 2 Mbps trở lên hệ số là 88% (tốc độ dùng được, người dùng tiêu thụ
gần hết); ở 1 Mbps hệ số là 82% (chậm hơn nhưng vẫn dùng được); ở 512 kbps hệ số là 65% (khá chậm, người
dùng hạn chế dùng).

Với FUP cap từ 1 đến 2 GB: ở 2 Mbps trở lên hệ số là 80% (lượng lớn, không phải ai cũng dùng hết); ở 1
Mbps hệ số là 72% (chậm cộng lượng lớn nên ít dùng hơn); ở 512 kbps hệ số chỉ 50% (rất ít người dùng hết
phần này).

Với FUP cap trên 2 GB: ở 1 Mbps hệ số là 60% (quá nhiều cho tốc độ này); ở 512 kbps hệ số chỉ 35% (gần như
chỉ dùng khi cần thiết).

## Giá trị FUP theo mức throttle — hướng dẫn định giá bán

Tốc độ throttle quyết định chất lượng trải nghiệm của phần FUP, từ đó quyết định người dùng sẵn lòng trả
bao nhiêu. Ở 2 Mbps, trải nghiệm đủ để xem video SD, video call chất lượng thấp, và stream nhạc — hệ số
giá trị so với tốc độ cao là 60%. Ở 1 Mbps, đủ để nhắn tin, đọc web, xem bản đồ, nghe nhạc — hệ số giá trị
45%. Ở 512 kbps, chỉ đủ nhắn tin, email, và tìm đường cơ bản — hệ số giá trị 25%. Ở 128 kbps, chỉ đủ tin
nhắn văn bản — hệ số giá trị 10%.

Cách áp dụng: nếu 1 GB tốc độ cao bán với giá P VND, thì 1 GB FUP ở 2 Mbps nên có giá thêm khoảng 0.60
nhân P; ở 1 Mbps nên có giá thêm khoảng 0.45 nhân P; ở 512 kbps nên có giá thêm khoảng 0.25 nhân P. Cách
tính này đảm bảo giá bán phản ánh đúng giá trị thực tế, tránh bán FUP quá rẻ làm mất margin hoặc quá đắt
làm mất cạnh tranh.

## Bảng chi phí tham chiếu (vùng Châu Á, 5 HKD/GB, tỷ giá 1 USD = 7.798 HKD = 26.394 VND)

Với gói 7 ngày: cấu trúc 1GB tốc độ cao cộng 0.5GB FUP ở 1Mbps có GB/ngày ước tính là 1×90% + 0.5×82% =
1.31, cho COGS 7 ngày là 45.9 HKD, tương đương 5.88 USD hay 155.200 VND. Cấu trúc 1GB cộng 1GB FUP 1Mbps
có hệ số 1×90% + 1×82% = 1.72, COGS 60.2 HKD, tương đương 7.72 USD hay 203.800 VND. Cấu trúc 2GB cộng 1GB
FUP 2Mbps có hệ số 2×85% + 1×88% = 2.58, COGS 90.3 HKD, tương đương 11.58 USD hay 305.700 VND. Cấu trúc
2GB cộng 1GB FUP 1Mbps có hệ số 2×85% + 1×82% = 2.52, COGS 88.2 HKD, tương đương 11.31 USD hay 298.600
VND. Cấu trúc 2GB cộng 1GB FUP 512kbps có hệ số 2×85% + 1×65% = 2.35, COGS 82.3 HKD, tương đương 10.55
USD hay 278.500 VND. Cấu trúc 3GB cộng 1GB FUP 1Mbps — cấu hình phổ biến nhất — có hệ số 3×80% + 1×82% =
3.22, COGS 112.7 HKD, tương đương 14.45 USD hay 381.500 VND. Cấu trúc 3GB cộng 1GB FUP 2Mbps có hệ số
3×80% + 1×88% = 3.28, COGS 114.8 HKD, tương đương 14.72 USD hay 388.700 VND. Cấu trúc 3GB cộng 1GB FUP
512kbps có hệ số 3×80% + 1×65% = 3.05, COGS 106.8 HKD, tương đương 13.69 USD hay 361.500 VND. Cấu trúc
3GB cộng 2GB FUP 1Mbps có hệ số 3×80% + 2×72% = 3.84, COGS 134.4 HKD, tương đương 17.24 USD hay 455.100
VND. Cấu trúc 5GB cộng 2GB FUP 1Mbps có hệ số 5×70% + 2×72% = 4.94, COGS 172.9 HKD, tương đương 22.17 USD
hay 585.300 VND.

Với gói 30 ngày: cấu trúc 1GB cộng 1GB FUP 1Mbps có COGS 258 HKD, tương đương 33.1 USD hay 873.900 VND.
Cấu trúc 2GB cộng 1GB FUP 1Mbps có COGS 378 HKD, tương đương 48.5 USD hay 1.280.100 VND. Cấu trúc 3GB
cộng 1GB FUP 1Mbps có COGS 483 HKD, tương đương 61.9 USD hay 1.634.800 VND. Cấu trúc 3GB cộng 2GB FUP
1Mbps có COGS 576 HKD, tương đương 73.9 USD hay 1.950.700 VND.

## So sánh các mức throttle cùng cấu hình

Với gói 7 ngày, cấu hình 3GB tốc độ cao cộng 1GB FUP ở vùng Châu Á: throttle 2 Mbps cho COGS khoảng
389.000 VND, giá trị FUP bằng 60% so với tốc độ cao, gợi ý giá thêm cao nhất. Throttle 1 Mbps cho COGS
khoảng 382.000 VND, giá trị 45%, gợi ý giá thêm trung bình. Throttle 512 kbps cho COGS khoảng 362.000
VND, giá trị 25%, gợi ý giá thêm thấp hơn. Chi phí 3HK giữa các mức throttle không chênh nhiều vì đều tính
theo GB, nhưng giá trị với khách hàng chênh đáng kể — đây chính là cơ hội để cấu trúc tier pricing hợp lý.

## Gợi ý hệ thống tier

Với gói 7 ngày vùng Châu Á, giả sử margin mục tiêu khoảng 40%: tier Starter (1GB tốc độ cao cộng 0.5GB FUP
512kbps) có COGS khoảng 117.000 VND, giá bán gợi ý 195.000 VND. Tier Basic (1GB cộng 1GB FUP 1Mbps) có
COGS khoảng 204.000 VND, giá bán gợi ý 340.000 VND. Tier Standard (2GB cộng 1GB FUP 1Mbps) có COGS khoảng
299.000 VND, giá bán gợi ý 499.000 VND. Tier Pro (3GB cộng 1GB FUP 1Mbps) có COGS khoảng 382.000 VND, giá
bán gợi ý 639.000 VND. Tier Pro+ (3GB cộng 2GB FUP 1Mbps) có COGS khoảng 455.000 VND, giá bán gợi ý
759.000 VND. Tier Max (5GB cộng 2GB FUP 2Mbps) có COGS khoảng 595.000 VND, giá bán gợi ý 990.000 VND. Các
giá bán trên chỉ là ví dụ với margin 40%, cần điều chỉnh theo giá thị trường, giá WM cùng loại, và định vị
kênh bán thực tế.

## Lưu ý quan trọng

Hệ số sử dụng FUP hiện là ước tính, chưa có dữ liệu thực tế từ 3HK cho mô hình này — nên thêm buffer 10%
vào COGS khi lần đầu ra gói mới. Luôn so sánh với WM trước khi định giá — nếu WM có gói fixed tương đương
và rẻ hơn thì cần điều chỉnh. Throttle 1 Mbps là điểm ngọt: đủ tốt để khách thấy có giá trị nhưng vẫn tiết
kiệm chi phí hơn 2 Mbps, phù hợp làm tier Standard. Còn FUP trên 2GB ở 1Mbps thường không hiệu quả vì
khách ít dùng hết, giá trị thực thấp — nên tăng cap tốc độ cao thay vì tăng FUP.

Xem thêm bài [[cong-thuc-gia-3hk|Công thức 3HK gốc]] cho gói unlimited throttle, bài [[ty-gia|Tỷ giá]],
bài [[vendor-3hk|Vendor 3HK]], và bài [[chon-vendor|Khi nào dùng 3HK vs WM]].
