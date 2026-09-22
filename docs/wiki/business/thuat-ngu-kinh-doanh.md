---
title: "Thuật Ngữ Chỉ Số Kinh Doanh (Business Metrics)"
page_type: reference
department: finance
audience: staff
visibility: all
tags: [metrics, cm1, gpm, revenue, 3hk, management-report, glossary, thuat-ngu]
aliases: ["CM1", "Contribution Margin 1", "GPM", "3HK Contribution", "Business Metrics", "Management Report Terms"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-23
updated: 2026-09-22
status: active
---

# Thuật Ngữ Chỉ Số Kinh Doanh

Từ 23/06/2026, cách gọi các chỉ số kinh doanh đã thống nhất với Management Report: tên gọi cũ "GP2/GPM2"
đã đổi thành "CM1/CM1%".

## Các chỉ số cốt lõi

Revenue là doanh thu. Gross Profit (GP), hay lợi nhuận gộp, bằng Revenue trừ COGS. Gross Profit Margin
(GPM%), tỷ suất lợi nhuận gộp, bằng Gross Profit chia Revenue nhân 100%. Contribution Margin 1 (CM1), lợi
nhuận đóng góp bậc một, bằng Gross Profit trừ Operation Cost. CM1% là CM1 chia Revenue nhân 100%. 3HK
Contribution Revenue % là tỷ trọng doanh thu từ sản phẩm 3HK, tính bằng doanh thu sản phẩm 3HK chia tổng
doanh thu nhân 100%.

COGS là chi phí của sản phẩm, tức giá nhập. Operation Cost là phí vận hành: phí sàn, phí quảng cáo, phí
tài trợ sản phẩm (sponsor), và chi phí media.

## Đổi tên thuật ngữ (23/06/2026)

Tên gọi "Gross Profit 2 (GP2)" đã đổi thành "Contribution Margin 1 (CM1)". Tên gọi "Gross Profit Margin 2
(GPM2)" đã đổi thành "% Contribution Margin (CM1%)". Lưu ý GPM% (Gross Profit Margin, không có số 2) giữ
nguyên không đổi — chỉ riêng GP2/GPM2 đổi tên thành CM1/CM1%.

## Hai chỉ số chính của team Business

CM1 (Contribution Margin 1) là lợi nhuận sau khi trừ cả COGS lẫn chi phí vận hành. 3HK Contribution
Revenue % là tỷ trọng doanh thu đến từ sản phẩm 3HK (vendor `3HKDATAPOOL`).

## Trên web analytics

Toàn bộ trang analytics đã đổi nhãn hiển thị từ GP2/GPM2 sang CM1/CM1% (áp dụng ở các tab Channels, BOD,
B2B, B2C, All-Time, Targets). 3HK Contribution % hiển thị dạng KPI ngay trên trang BOD (Board of Directors
Report). Trong dữ liệu, sản phẩm 3HK được nhận diện qua điều kiện `dim_sku.vendor ILIKE '3HKDATAPOOL'`.

## Quy tắc lọc dữ liệu chuẩn khi tính các chỉ số trên

Khi lọc doanh thu sản phẩm 3HK, điều kiện chuẩn là so khớp CHÍNH XÁC vendor sau khi bỏ khoảng trắng và
viết hoa (`3HKDATAPOOL`) — không dùng kiểu so khớp gần đúng như "bắt đầu bằng 3HK", vì hệ thống còn có
những vendor khác cũng bắt đầu bằng "3H" (xem [[ma-sku|Cấu Trúc Mã SKU]] mục vendor).

Khi phân tích riêng khối B2B, bắt buộc loại trừ các tài khoản hệ thống không phải khách hàng thật:
"B2C Customer US", "B2C Customer VN", "B2B Ops" — đây là các mã dùng nội bộ để gán đơn, không phải khách
hàng B2B thật, lẫn vào sẽ làm sai số lượng khách và doanh thu bình quân.

Chênh lệch giữa GP tổng và tổng GP theo từng kênh thường do nhóm "Internal-Transaction" (SIM dùng nội bộ)
— nhóm này có COGS thật (tốn tiền nhập hàng) nhưng Doanh thu ghi nhận bằng 0, nên kéo GP tổng xuống âm so
với khi cộng riêng từng kênh. Đây là hiện tượng bình thường, không phải sai số tính toán.

Chi phí vận hành (Operation Cost) khi tính CM1 luôn phải CỘNG DỒN (SUM) tất cả các khoản phí phần trăm áp
trên kênh, không được lấy giá trị lớn nhất (MAX) — một kênh có thể chịu nhiều loại phí cùng lúc (phí sàn,
phí quảng cáo, phí tài trợ...) và phải cộng đủ mới ra đúng chi phí vận hành thật.

Xem thêm bài [[gioi-thieu-gohub|GoHub Overview]] và [[vendor-3hk|3HK]].
