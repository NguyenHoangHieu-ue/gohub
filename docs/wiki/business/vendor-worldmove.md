---
title: "Vendor WorldMove (WM) — Hướng Dẫn Tư Vấn"
audience: cs-product
visibility: all
page_type: vendor_profile
department: cs-sale
tags: [vendor, worldmove, wm, apn, esim, sim, tu-van]
aliases: ["WorldMove", "WM", "WORLDMOVE"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-04
status: active
---

# Vendor WorldMove (WM) — Hướng Dẫn Tư Vấn

WM là vendor chính của GoHub, có hơn 8.900 gói, phủ sóng hầu hết các nước, và không cần KYC. Luôn thử WM
trước khi xét vendor khác. CS chỉ cần nắm năm loại gói WM và cách giải thích chúng cho khách hàng.

## WM là lựa chọn đầu tiên khi nào

Dùng WM trước cho tất cả các nước, trừ ba trường hợp: đi Nhật Bản thì dùng KDDI (nhờ partnership riêng,
chất lượng cao hơn); nước không có trong catalog WM thì chuyển sang 3HK; và khi WM có gói nhưng giá kém
cạnh tranh hơn 3HK thì cũng chuyển sang 3HK.

## Năm loại gói WM

Titanium AYCE là gói true unlimited, tốc độ không giảm dù dùng bao nhiêu — giải thích cho khách là "dùng
thoải mái, tốc độ không đổi cả chuyến", phù hợp khách cần stream nhiều hoặc làm việc online.

Premium Unlimited giảm về 10 Mbps sau khi dùng hết 1GB tốc độ cao mỗi ngày — giải thích là "tốc độ cao
1GB/ngày, sau đó vẫn dùng được bình thường", phù hợp khách du lịch dùng vừa phải.

Standard Unlimited giảm về 5 Mbps sau khi dùng hết 2GB tốc độ cao mỗi ngày — giải thích là "2GB tốc độ cao
mỗi ngày, sau đó 5Mbps vẫn đủ dùng", phù hợp khách phổ thông ngân sách vừa.

Fixed Data giảm về 128 kbps sau khi hết dung lượng — giải thích là "tổng X GB, hết thì vẫn kết nối được
nhẹ", phù hợp khách du lịch ngắn ngày đã biết rõ nhu cầu.

Daily Data cũng giảm về 128 kbps sau khi hết quota ngày — giải thích là "X GB mỗi ngày, reset lúc nửa
đêm", phù hợp khách muốn dùng đều đặn hàng ngày.

Mã data policy tương ứng từng loại gói nằm ở bài [[loai-data-policy|Data Policy Codes]].

## Câu hỏi thường gặp từ khách hàng

Khi khách hỏi gói có dùng được ở một nước cụ thể không, trả lời: "Dạ WM phủ sóng [nước] qua mạng [nhà
mạng địa phương]. Em kiểm tra ngay trong hệ thống — anh/chị cần SIM hay eSIM?"

Khi khách hỏi nên chọn SIM hay eSIM, trả lời: "eSIM tiện hơn vì cài trực tiếp trên điện thoại, không cần
chờ giao hàng. Điện thoại từ iPhone XS (2018) trở lên hoặc Android hỗ trợ eSIM là dùng được. Còn lại thì
dùng SIM vật lý."

Khi khách hỏi hết data thì sao, trả lời tùy loại gói: gói Unlimited vẫn dùng được ở tốc độ thấp hơn; gói
Fixed hoặc Daily vẫn kết nối được nhẹ ở 128 kbps, đủ chat nhưng không stream được.

Khi khách hỏi cách cài APN, trả lời: "Đa số điện thoại tự cài khi gắn SIM hoặc cài eSIM. Nếu cần nhập tay,
em gửi thông tin APN riêng cho gói đó."

Khi khách hỏi gói có cần KYC (đăng ký giấy tờ) không, trả lời: "Gói WM không cần KYC — anh/chị cài là dùng
được ngay, không cần gửi CCCD hay hộ chiếu."

## Thông tin APN

Mỗi gói WM có APN riêng, tra đúng tại tab Danh mục SKU trên hệ thống, tìm mã SKU rồi xem APN. Với thuê bao
Việt Nam, APN của Mobifone thường là `m-wap`, còn Viettel thường là `v-internet`. Lưu ý APN thay đổi theo
từng gói và từng nước, luôn tra trong hệ thống thay vì nhớ cứng.

## Lưu ý khi tư vấn

WM không yêu cầu KYC, đây là lợi thế lớn nên nhấn mạnh với khách. Catalog có 8.921 gói nên hầu hết nước
đều có sẵn, kèm thông tin APN đầy đủ cho từng gói. Luôn kiểm tra gói đang chọn có cả eSIM và SIM vật lý
hay không trước khi chốt đơn — không phải gói nào cũng có cả hai. Và nhớ WM mạnh về độ phủ rộng; nếu khách
cần chất lượng cao nhất ở Nhật thì chuyển sang KDDI.

## Thông tin kỹ thuật cho team Product/BD

Trong mã SKU, vendor WM được mã hoá bằng hai ký tự `GB` ở vị trí 6-7 (mã nội bộ GoHub, không phải viết
tắt tên vendor). WM báo giá theo gói cố định, không tính theo GB như 3HK. Tổng sản phẩm hiện có là 8.921
gói, không yêu cầu KYC.

Format file báo giá là GoHub Standard XLSX, sheet "Goi co san" — tải template tại trang SP Vendor, nút
"Tải template". Gap analysis tự động chạy ở tab SP Vendor, mục WM, bộ lọc "Chưa có trong HT".

Xem thêm bài [[chon-vendor|Khi nào WM vs 3HK vs KDDI?]], [[ma-sku|Đọc mã SKU]],
[[loai-data-policy|Các mã data policy]], và [[quy-trinh-import-ncc|Quy trình import báo giá WM]].
