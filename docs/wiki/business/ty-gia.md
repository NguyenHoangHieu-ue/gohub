---
title: "Tỷ Giá Nội Bộ GoHub"
page_type: pricing_rule
department: finance
audience: cs-product
visibility: all
tags: [ty-gia, fx-rates, usd, vnd, hkd, pricing, tu-van]
aliases: ["Tỷ giá", "FX Rates", "Exchange Rates"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-22
status: active
---

# Tỷ Giá Nội Bộ GoHub

> ⚠️ Tỷ giá là giá trị SỐNG trong bảng `app_settings` (Supabase), sửa được bất kỳ lúc nào ở Admin → Cài
> đặt → Tỷ giá nội bộ — con số trong bài chỉ mang tính tham chiếu tại thời điểm cập nhật gần nhất. Tuyệt
> đối không hardcode tỷ giá trong code hay báo cáo; luôn tra bảng `app_settings` (hoặc trang Admin) để lấy
> số mới nhất.

Tỷ giá hiện hành tính đến 04/09/2026: 1 USD bằng 26.266 VND, 1 USD bằng 7.801 HKD, và 1 USD bằng 31.666
TWD. Tỷ giá do admin cập nhật thủ công, chỉnh tại web mục Admin, tab Cài đặt, phần Tỷ giá nội bộ.

## Đơn vị tiền được hỗ trợ

Hệ thống hỗ trợ 11 loại tiền: USD (đô la Mỹ, dùng làm giá gốc chuẩn), VND (đồng Việt Nam, hiển thị cho
kênh VN), HKD (đô la Hồng Kông, dùng cho 3HK), TWD (đô la Đài Loan), JPY (yên Nhật, dùng cho KDDI), EUR
(euro), GBP (bảng Anh), AUD (đô la Úc), SGD (đô la Singapore), THB (baht Thái), và KRW (won Hàn).

## Quy đổi giá nhập

Với sản phẩm WM, giá nhập theo USD bằng giá vendor chia tỷ giá đơn vị tiền gốc sang USD, rồi giá nhập
theo VND bằng giá nhập USD nhân tỷ giá USD/VND hiện hành. Ví dụ một gói Japan giá 5.5 USD ở tỷ giá
26.266 sẽ cho giá nhập VND bằng 5.5 × 26.266 = 144.463 VND.

Với sản phẩm 3HK, trước tiên tính GB thực bằng GB danh nghĩa nhân hệ số theo loại gói (xem công thức 3HK
để biết hệ số cụ thể), rồi giá nhập HKD bằng GB thực nhân giá mỗi GB, giá nhập USD bằng giá nhập HKD chia
tỷ giá HKD/USD hiện hành, và giá nhập VND bằng giá nhập USD nhân tỷ giá USD/VND hiện hành. Công thức chi
tiết xem ở bài [[cong-thuc-gia-3hk|Công Thức Tính Giá Nhập 3HK]].

## Hiển thị giá theo role

Admin và Manager thấy giá theo cả USD và VND. Staff không thấy giá vốn — bị ẩn hoàn toàn. Theo kênh bán,
kênh VN hiển thị VND còn kênh US hiển thị USD.

## Cập nhật tỷ giá

Vào web mục Admin, chọn Cài đặt, chỉnh sửa tỷ giá trực tiếp rồi lưu — toàn bộ tính toán trong hệ thống sẽ
tự động dùng tỷ giá mới sau khi cache làm mới (khoảng 30 phút).

## Lịch sử tỷ giá

Tỷ giá tháng 3/2026 và tháng 6/2026 giữ nguyên như nhau: 1 USD = 26.394 VND, 1 USD = 7.798 HKD, 1 USD =
31.452 TWD. Từ 04/09/2026, tỷ giá đổi sang 1 USD = 26.266 VND, 1 USD = 7.801 HKD, 1 USD = 31.666 TWD. Bảng
này cập nhật mỗi khi có thay đổi tỷ giá mới — nhưng luôn ưu tiên tin theo Admin → Cài đặt nếu có chênh
lệch, vì đó là nơi hệ thống thật sự đọc số để tính toán.
