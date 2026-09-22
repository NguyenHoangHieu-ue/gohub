---
title: "Quy Trình CS & Vận Hành: SIMPIN, Tồn Kho Cận Date, Báo Cáo Tuần"
audience: cs-product
visibility: all
page_type: process
department: cs-sale
tags: [cs, simpin, gighub, airhub, tonkho, phoi-sim, bao-cao-tuan, quy-trinh]
aliases: ["SIMPIN Gighub", "Playbook tồn kho", "Báo cáo tuần Non-Strategic"]
last_edited_by: ""
last_edited_at: ""
created: 2026-09-22
updated: 2026-09-22
status: active
---

# Quy Trình CS & Vận Hành

## Check mã SIMPIN cho sản phẩm Gighub (Airhub)

Một số nước bắt buộc mã SIMPIN mới kích hoạt được SIM/eSIM Gighub (Airhub): Australia (local), Vương quốc
Anh (mạng EE), và Pháp (mạng Orange). Với các gói này, hệ thống tự động gửi kèm mã SIMPIN trong email xác
nhận mua hàng thành công gửi cho khách — CS không cần làm gì thêm trong trường hợp bình thường.

Khi khách cần tra gấp hoặc gặp case đặc biệt (không nhận được email, cần xác nhận lại mã), CS tự tra cứu
trên Portal Gighub theo các bước: đăng nhập portal bằng tài khoản CS dùng chung (liên hệ quản lý để lấy
thông tin đăng nhập — không ghi credential vào tài liệu này), xác thực bằng mã OTP gửi về email tài khoản
đó (mỗi lần đăng nhập là một mã OTP mới), sau đó vào mục **Purchase History**, lọc theo loại gói cước và
thời gian mua, mở chi tiết đơn hàng tương ứng để xem và sao chép mã SIMPIN gửi cho khách.

## Playbook xử lý tồn kho & phôi SIM cận date / bán chậm

### Phôi SIM Blank (phôi trắng cận date hoặc tồn đọng lớn)

Áp dụng cho các mã phôi SIM blank dùng chung nhiều vendor (UnionPay, Elite, Joytel...). Xử lý theo bốn
bước: lấy danh sách gói cước mới nhất từ NCC tương ứng với phôi; lọc các gói cước/thị trường tương đồng
đang bán chạy trên B2C hoặc B2B rồi tạm gán (attach) phôi tồn để cấp cho các đơn hàng này, xả sạch tồn phôi
xong mới chuyển lại phôi chuẩn; đăng bán mới linh động bằng cách chọn các gói cước giá cạnh tranh nhất của
NCC để tạo SKU/Listing mới và đăng bán ngay; và cuối cùng chào deal combo/bulk — bán trọn gói cước kèm
phôi cho đại lý B2B chuyên tuyến với giá chiết khấu.

### eSIM & gói cước cận date (HSD dưới 60 ngày)

Xử lý theo ba bước: swap trả hàng (free upgrade) — cấp mã cận date này trả cho các đơn hàng cùng ngày/data
tương đương trên Web/Ecom, khách được trải nghiệm gói tốt hơn (ví dụ tặng thêm phút gọi/SMS) giúp xả kho
nhanh mà không tốn chi phí marketing; mở lại kênh bán và giảm giá xả lỗ — mở lại trạng thái Active trên
các kênh chưa bật hoặc đang tắt (Shopee, MoMo, ZaloPay, Traveloka...), hạ giá niêm yết B2C về mức hòa vốn
hoặc cắt lỗ nhẹ so với COGS để thu hồi vốn trước khi hết hạn; và xả sỉ B2B — chào trọn lô tồn cho 1-2 đại
lý B2B với giá xả lỗ, thu tiền về ngay.

## Quy trình báo cáo tuần cho PIC nhóm khách hàng Non-Strategic

Báo cáo tuần (recap) của mỗi PIC gồm năm phần theo đúng thứ tự: tiến độ CM1 cá nhân (đạt hay không đạt so
với mục tiêu tuần); tình hình khách cũ (hoạt động trong tuần, đã catch-up với ai, kết quả ra sao); reach
out khách mới (số lượng đã trao đổi, điểm cần chú ý); kế hoạch tuần tiếp theo; và cuối cùng là đề xuất/
thảo luận khác kèm số liệu chi tiết nếu có.

Xem thêm bài [[gioi-thieu-gohub|GoHub Overview]], [[ma-sku|Cấu Trúc Mã SKU]] mục Trạng thái SKU Temporary,
và [[thuat-ngu-kinh-doanh|Thuật Ngữ Chỉ Số Kinh Doanh]] cho các chỉ số dùng trong báo cáo CM1.
