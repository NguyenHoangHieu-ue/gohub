---
title: "Combo Chuẩn GoHub (42 combo/country)"
page_type: product_guide
department: product
audience: cs-product
visibility: all
tags: [combo, sku, standard, gap-analysis, product-guide, tu-van]
aliases: ["Combo Chuẩn", "42 combo", "GoHub Standard Combo"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-04
status: active
---

# Combo Chuẩn GoHub

Mỗi nước GoHub triển khai đều cần đủ 42 combo, gồm ba nhóm nhân sáu biến thể ngày. Khi phân tích gap thấy
"thiếu combo" nghĩa là cần yêu cầu vendor tạo thêm sản phẩm, chứ không phải vendor đã hết hàng.

## 42 combo bằng ba nhóm nhân sáu biến thể ngày

Nhóm một là Daily Data (data theo ngày), gồm ba mức dung lượng — 1GB/ngày, 2GB/ngày, 3GB/ngày — mỗi mức
có đủ sáu mốc thời hạn 7, 14, 21, 30, 60, và 90 ngày. Ba mức nhân sáu mốc cho ra 18 combo.

Nhóm hai là Fixed Data (tổng dung lượng cố định), gồm ba mức — 5GB, 10GB, 20GB — mỗi mức cũng đủ sáu mốc
thời hạn như trên, cho ra thêm 18 combo.

Nhóm ba là Unlimited, chỉ một loại nhưng đủ sáu mốc thời hạn, cho ra 6 combo.

Tổng cộng 18 cộng 18 cộng 6 bằng 42 combo.

## Thuật ngữ quan trọng khi diễn đạt

Khi GoHub chưa tạo SKU cho một gói, diễn đạt đúng là "cần yêu cầu vendor tạo thêm SKU" — không nói "vendor
không có hàng". Khi một SKU đang bán được, diễn đạt đúng là "có trong hệ thống GoHub" — tránh nói mơ hồ
"có sẵn". Khi GoHub chưa tạo SKU, diễn đạt đúng là "chưa có trong hệ thống GoHub" — không nói "hết hàng".
Khi WM có gói và GoHub đã tạo SKU tương ứng, ghi rõ "WM có, GoHub đã tạo". Khi WM có gói nhưng GoHub chưa
tạo SKU, ghi rõ "WM có, GoHub chưa tạo".

## Ưu tiên vendor theo nước

Chi tiết đầy đủ xem ở bài [[chon-vendor|Chọn Vendor Nào?]]. Tóm tắt nhanh: Hồng Kông ưu tiên WM vì không
cần KYC và giá tốt. Đài Loan ưu tiên WM vì không cần KYC và phủ sóng tốt. Nhật Bản ưu tiên KDDI nhờ
partnership riêng. Các nước khác ưu tiên 3HK trước. BC và JY chỉ dùng khi hết lựa chọn khác (last resort).

## Quy trình gap analysis

Lấy danh sách 42 combo chuẩn cho một nước, kiểm tra SKU nào đang bán được trong GoHub, rồi đối chiếu với
catalog WM xem gói nào đã tạo và gói nào chưa. Kết quả cho ra ba con số: số combo GoHub đã có trên tổng
42, số combo WM có nhưng GoHub chưa tạo, và số combo WM cũng không có (cần yêu cầu vendor). Xem trực tiếp
tại web, mục SP Vendor, tab WM, bộ lọc "Chưa có trong HT".
