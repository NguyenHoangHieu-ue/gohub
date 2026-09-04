---
title: "Quy Trình Import NCC — Upload → Kiểm tra → Xác nhận"
page_type: process_sop
department: product
audience: staff
visibility: all
tags: [process, import, ncc, wm, 3hk, upload, diff, quy-trinh]
aliases: ["Import NCC", "Upload NCC", "Cập nhật giá vendor"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-04
status: active
---

# Quy Trình Import NCC

Khi vendor như WM hay 3HK gửi file báo giá mới, GoHub cần cập nhật vào hệ thống mà không làm mất thông
tin cũ (APN, cấu hình mạng...) và phải thấy rõ những gì thay đổi trước khi xác nhận.

## Tổng quan các bước

Vendor gửi file Excel hoặc CSV, người dùng upload file đó tại web mục SP Vendor. Hệ thống tự phân tích và
so sánh với dữ liệu hiện có, hiển thị danh sách thay đổi chia làm ba nhóm: sản phẩm mới, giá thay đổi, và
ngưng cung cấp. Người dùng xem lại rồi xác nhận, sau đó hệ thống cập nhật vào cơ sở dữ liệu và ghi lại
lịch sử import.

## Bước 1 — Chuẩn bị file

Hệ thống hỗ trợ hai định dạng. WM Native Format (CSV hoặc XLSX) được nhận dạng tự động qua cột
`wmproductId`, chứa các cột như ID sản phẩm, tên, khu vực, loại, giá nhập, và thông tin eSIM. GoHub
Standard Format (XLSX) dùng sheet tên "Goi co san" cho gói cố định và/hoặc sheet "Datapool" cho giá theo
GB — tải template tại web mục SP Vendor, nút "Tải template". Nếu vendor dùng định dạng riêng, cần chuyển
sang GoHub Standard trước khi import.

## Bước 2 — Upload và xem thay đổi

Vào web mục SP Vendor, chọn tab vendor tương ứng (ví dụ WM), bấm nút "Import CSV" (chỉ hiện với vai trò
Admin hoặc Manager), rồi chọn file từ máy — hệ thống tự phân tích ngay.

Danh sách thay đổi hiển thị theo ba nhóm màu: nhóm sản phẩm mới tô xanh, nghĩa là có trong file nhưng chưa
có trong hệ thống; nhóm giá thay đổi tô vàng, nghĩa là giá nhập khác so với dữ liệu hiện tại; nhóm ngưng
cung cấp tô đỏ, nghĩa là có trong hệ thống nhưng không còn xuất hiện trong file mới. Mỗi nhóm có thể mở
hoặc thu gọn, mặc định hiện tối đa 5 mẫu đầu.

## Bước 3 — Xác nhận import

Sau khi xem lại danh sách, bấm "Xác nhận Import" để hệ thống cập nhật toàn bộ. Thông tin APN được giữ
nguyên — cấu hình mạng và nhà mạng không bị ghi đè khi chỉ có giá thay đổi. Lịch sử import được lưu lại
đầy đủ, gồm ngày giờ, số lượng dòng, và trạng thái.

## Nhận dạng định dạng tự động

Khi file được upload, hệ thống kiểm tra: nếu có cột "wmproductId" thì xử lý theo WM native; nếu có sheet
"Goi co san" hoặc cột "vendor_code" thì xử lý theo GoHub Standard.

## Cấu trúc GoHub Standard Template

Sheet "Goi co san" dùng cho gói cố định (WM, BC, SS...) có các cột bắt buộc: `vendor_code`, `vendor_id`,
`product_name`, `region`, `sim_type`, `days`, `data_gb`, `is_daily`, `is_unlimited`, `cost_price`,
`currency`, và `is_kyc`. Các cột tùy chọn gồm `throttle_mbps`, `apn`, `network_type`, `is_lesim`, và
`notes`.

Sheet "Datapool" dùng cho giá theo GB (3HK...) có các cột bắt buộc: `vendor_code`, `zone_id`, `zone_name`,
`countries`, `sim_type`, `price_per_gb`, `currency`, và `is_kyc`. Các cột tùy chọn gồm `network_type` và
`notes`.

## Một số lưu ý

Nếu file giống hệt lần import trước, hệ thống sẽ cảnh báo "file không có thay đổi mới". Sản phẩm bị đánh
dấu "ngưng cung cấp" không bị xoá khỏi hệ thống, chỉ đánh dấu trạng thái. Định dạng WM cũ vẫn hoạt động
bình thường, không cần chuyển đổi trước.

Xem thêm phần Format File Báo Giá trong bài [[vendor-worldmove|WM]] và bài [[vendor-3hk|3HK]], cùng bài
[[ty-gia|Tỷ giá]] khi cần tính giá nhập.
