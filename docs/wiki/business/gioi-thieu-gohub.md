---
title: "GoHub — Tổng Quan Công Ty"
audience: staff
visibility: all
page_type: reference
department: all
tags: [company, overview, phap-nhan, kenh-ban, gioi-thieu]
aliases: ["GoHub Overview", "Giới thiệu GoHub", "GoHub là gì"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-04
status: active
---

# GoHub — Tổng Quan Công Ty

GoHub cung cấp dịch vụ SIM và eSIM du lịch quốc tế — mua gói data từ các nhà mạng/vendor rồi bán lại cho
khách hàng cần kết nối khi ra nước ngoài. Hai sản phẩm chính là eSIM, cài trực tiếp qua QR hoặc app mà
không cần thẻ vật lý (loại phổ biến nhất), và SIM vật lý, dùng thẻ truyền thống hỗ trợ mọi điện thoại.

## Hai pháp nhân

GoHub vận hành qua hai pháp nhân song song. GoHub JSC (Công ty Cổ phần GoHub Việt Nam) phục vụ thị trường
Việt Nam, và mọi SKU của pháp nhân này bắt đầu bằng một trong các ký tự `1`, `2`, `3`, `4`, `5`, `6`.
GoHub Inc (GoHub Incorporated, trụ sở Mỹ) phục vụ thị trường Mỹ và quốc tế, SKU bắt đầu bằng `A`, `B`,
`C`, `D`, hoặc `E`.

## Kênh bán hàng

Kênh B2C bán lẻ trực tiếp đến người dùng cuối, qua ví điện tử (ShopeePay, Momo, ZaloPay), nền tảng du
lịch (KKday, Traveloka), mạng xã hội (TikTok Shop), và website riêng (Gohub.vn).

Kênh B2B bán buôn cho đối tác, chia làm ba dạng: Wholesale/Strategic là đối tác lớn nhập số lượng lớn với
giá đặc biệt; On Demand là đặt hàng theo yêu cầu ở giá thị trường; Portal là đối tác tự quản lý đơn hàng
qua hệ thống riêng.

CS nên tham khảo thêm bài [[chon-vendor|Chọn Vendor Nào?]] để biết khi nào dùng vendor nào cho từng nước.

## Các nhà cung cấp hiện tại

WorldMove (WM) là vendor chính, có hơn 8.900 gói, phủ sóng rộng và không yêu cầu KYC. 3HK Datapool cũng
là vendor chính, tính giá theo GB trên 45 vùng địa lý, linh hoạt cho việc tạo gói mới. KDDI được dùng hạn
chế, chỉ cho Nhật Bản, nhưng chất lượng cao. BillionConnect và SimStore đang trong giai đoạn phát triển,
chưa đủ điều kiện triển khai rộng.

## Cấu trúc sản phẩm bốn cấp

Sản phẩm GoHub tổ chức theo bốn tầng lồng nhau. Product là 8 ký tự đầu của mã SKU, gom các gói cùng loại
(cùng nước, cùng vendor, cùng loại data). Bên trong mỗi Product là các SKU (13 ký tự) — đơn vị sản phẩm cụ
thể, phân biệt theo dung lượng và số ngày. Mỗi SKU có thể có nhiều Listing — tên hiển thị trên từng kênh,
tiếng Việt hoặc tiếng Anh. Và mỗi Listing sinh ra các Item (18 ký tự trở lên) — đơn vị bán thực tế, gắn
với một kênh và một đối tác cụ thể.

CS chỉ cần nhớ: SKU chính là gói cụ thể mà khách mua. Cách đọc từng ký tự trong mã SKU nằm ở bài
[[ma-sku|Cấu Trúc Mã SKU]].

## Quy trình cốt lõi

Khi vendor gửi báo giá mới, team Product import vào hệ thống, so sánh gap để biết nước nào hoặc gói nào
GoHub chưa có, rồi tạo SKU, tạo Listing, và tạo Item trên từng kênh. Sau đó CS mới bán được sản phẩm đó
cho khách hàng.

## Các chỉ số quan trọng

Revenue là doanh thu, tính bằng giá bán nhân số lượng — đây là mục tiêu tháng của team. GP (Gross Profit)
là doanh thu trừ giá nhập (COGS), phản ánh biên lợi nhuận gộp. CM1 là GP trừ tiếp chi phí vận hành kênh
(phí sàn, quảng cáo), cho biết lợi nhuận thực sau các chi phí đó. 3HK% là tỉ lệ doanh thu đến từ sản phẩm
3HK, một KPI quan trọng của team. Giải thích đầy đủ từng chỉ số nằm ở bài
[[thuat-ngu-kinh-doanh|Thuật Ngữ Chỉ Số Kinh Doanh]].

## Liên hệ theo chủ đề

Hỏi về sản phẩm, vendor, hoặc gap sản phẩm thì liên hệ Team Product. Hỏi về giá hoặc chiết khấu B2B thì
liên hệ BD/Sales. Hỏi về đơn hàng hoặc fulfillment thì liên hệ Ops. Hỏi về hệ thống hoặc lỗi phần mềm thì
liên hệ Hiếu, admin của GoHub Intel.
