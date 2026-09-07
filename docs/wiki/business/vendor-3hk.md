---
title: "Vendor 3HK — Hướng Dẫn Tư Vấn"
audience: cs-product
visibility: all
page_type: vendor_profile
department: cs-sale
tags: [vendor, 3hk, zone, tu-van, sim, esim, data-pool]
aliases: ["3HK", "3 Hong Kong", "3HK Datapool"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-04
status: active
---

# Vendor 3HK — Hướng Dẫn Tư Vấn

3HK là vendor data quốc tế; GoHub mua theo GB rồi tạo gói bán lại. Dùng 3HK khi nước khách hỏi không có
trong WM, hoặc khi WM kém cạnh tranh hơn. CS không cần tra 3HK nếu GoHub đã có sẵn SKU — chỉ cần bán SKU
đã có.

## Khi nào CS cần biết đến 3HK

Nếu khách hỏi một nước đã có SKU GoHub thì bán bình thường, không cần tra 3HK. Nếu khách hỏi một nước
chưa có SKU thì kiểm tra xem 3HK có vùng phủ đó không rồi báo team Product tạo thêm. Nếu khách hỏi "dùng
mạng gì ở nước X" thì tra tab NCC, mục 3HK, xem vùng tương ứng. Khi team Product tạo gói mới thì dùng giá
3HK cùng công thức tính COGS để tạo SKU.

## Vùng phủ sóng và giá

3HK chia vùng theo ba mức giá. Khu vực Châu Á Tier 1 — gồm Nhật, Hàn, Singapore, Thái, Malaysia, Hong
Kong, Đài Loan, Indonesia, Philippines, Việt Nam, Cambodia, Lào — có giá 5 HKD mỗi GB. Khu vực Châu Âu và
Mỹ — gồm Anh, Đức, Pháp, Ý, Tây Ban Nha, USA, Canada — có giá 7 HKD mỗi GB. Khu vực Úc và New Zealand có
giá 6.5 HKD mỗi GB. Tỷ giá HKD sang VND xem ở bài [[ty-gia|Tỷ Giá Nội Bộ]]. Tổng cộng 3HK phủ 45 vùng địa
lý, tra đầy đủ tại tab NCC Catalog, mục 3HK.

## Các loại gói GoHub tạo từ 3HK

Fixed Data có tổng dung lượng cố định (3, 5, 10, hoặc 20GB), hết là hết — phù hợp khách biết rõ nhu cầu,
đi ngắn ngày. Daily Data cấp mỗi ngày một lượng cố định (ví dụ 1GB/ngày), reset lúc nửa đêm — phù hợp
khách muốn dùng đều, không lo bùng data. Unlimited 10 Mbps cho dùng thoải mái, sau khi vượt 1.8GB mỗi
ngày mới giảm về 10 Mbps — phù hợp khách du lịch dài ngày cần stream hoặc dùng bản đồ. Unlimited 5 Mbps
tương tự nhưng ngưỡng là 1.6GB mỗi ngày trước khi giảm về 5 Mbps — phù hợp khách ngân sách hạn chế, chỉ
chat hoặc browse nhẹ.

## Script tư vấn khách hàng

Khi khách hỏi "đi [nước] thì dùng SIM nào", trả lời: "Dạ bên em có gói eSIM/SIM cho [nước] từ mạng 3HK,
phủ sóng tốt, không cần đăng ký giấy tờ. Anh/chị dùng khoảng [số ngày] ngày, nhu cầu data [nhiều/ít]? Em
có thể tư vấn gói phù hợp nhất."

Khi khách hỏi về tốc độ, trả lời: "Gói Unlimited có tốc độ cao không giới hạn trong ngày, sau [1.8/1.6]GB
sẽ giảm về [10/5] Mbps — vẫn dùng được thoải mái cho chat, map, browse."

Khi khách lo về vùng phủ sóng, trả lời: "3HK dùng hạ tầng [nhà mạng địa phương] tại [nước], phủ sóng
[4G/5G]."

## Lưu ý quan trọng khi tư vấn

Đa số vùng không cần KYC — đây là lợi thế lớn khi tư vấn. GoHub đã tạo sẵn các combo chuẩn nên CS chỉ cần
chọn đúng SKU. Không được bán "gói 3HK" — luôn bán SKU GoHub đã build từ 3HK. Nếu khách hỏi một nước chưa
có SKU, đừng vội báo "không có" — kiểm tra với team Product trước. Và COGS của 3HK được tính theo hệ số
chứ không phải giá trọn gói, nên không tiết lộ giá nhập cho khách.

## Thông tin kỹ thuật cho team Product

Trong mã SKU, vendor 3HK được mã hoá bằng hai ký tự `3D` ở vị trí 6-7. Công thức COGS tóm tắt như sau: gói
Fixed Data nhân dung lượng gói với hệ số 0.55 (ví dụ 5GB cho ra 5×0.55×5 = 13.75 HKD ở vùng 5 HKD/GB); gói
Daily Data nhân dung lượng mỗi ngày với số ngày rồi với hệ số 0.40 (ví dụ 1GB×7 ngày cho ra
7×0.4×5 = 14 HKD); gói Unlimited 10 Mbps tính 1.8GB mỗi ngày nhân số ngày (ví dụ 7 ngày cho ra
1.8×7×5 = 63 HKD); gói Unlimited 5 Mbps tính 1.6GB mỗi ngày nhân số ngày (ví dụ 7 ngày cho ra
1.6×7×5 = 56 HKD). Công thức chi tiết đầy đủ nằm ở bài [[cong-thuc-gia-3hk|Công Thức Tính Giá Nhập 3HK]].

Xem thêm bài [[chon-vendor|Khi nào chọn 3HK vs WM?]], [[ty-gia|Tỷ giá HKD/USD/VND]],
[[ma-sku|Cách đọc mã SKU]], và [[combo-chuan|42 combo chuẩn GoHub]].
