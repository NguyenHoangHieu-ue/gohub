---
title: "Chính Sách Vendor: QR, Đổi Thiết Bị, Hủy/Hoàn Tiền"
audience: cs-product
visibility: all
page_type: policy
department: cs-sale
tags: [vendor, policy, qr, refund, replacement, device-change, cs, hoan-tien, doi-thiet-bi]
aliases: ["Vendor Policy", "Chính sách QR", "Chính sách đổi máy", "Chính sách hủy hoàn tiền"]
last_edited_by: ""
last_edited_at: ""
created: 2026-09-22
updated: 2026-09-22
status: active
---

# Chính Sách Vendor: QR, Đổi Thiết Bị, Hủy/Hoàn Tiền

Mỗi vendor có quy định riêng về hạn dùng mã QR kích hoạt, điều kiện cài đặt, số lần được quét lại/đổi
thiết bị, và điều kiện hủy/hoàn tiền khi khách gặp sự cố. CS bắt buộc nắm đúng phần của từng vendor trước
khi tư vấn hoặc xử lý khiếu nại — nhầm chính sách giữa các vendor là nguyên nhân phổ biến gây hứa sai với
khách. Bài này tổng hợp theo yêu cầu team OPS, nguồn từ bảng chính sách nội bộ (cập nhật 2026-09-22).

Quy tắc chung áp dụng mọi vendor: bắt buộc thiết bị phải kết nối Internet (Wi-Fi hoặc 4G) trong lúc quét
mã QR — quét khi mất mạng gần như chắc chắn fail. Ngoài quy tắc chung này, chi tiết từng vendor khác nhau
đáng kể, không được suy diễn chéo giữa các vendor.

## BC Datapool

Mã QR có hạn hiệu lực 90 ngày kể từ ngày tạo đơn thành công. eSIM BC Datapool cho phép quét/cài đặt lại
(re-install) tối đa 10 lần trên cùng một thiết bị, và hỗ trợ đổi sang thiết bị khác (Device Replacement)
tối đa 3 lần. Khi hủy để hoàn tiền, bắt buộc phải xóa eSIM khỏi máy trước — chỉ hoàn lại phần dung lượng
chưa sử dụng, không hoàn toàn bộ giá trị đơn nếu khách đã dùng một phần. Về quản lý dung lượng, BC Datapool
hỗ trợ kiểm tra và theo dõi dung lượng sử dụng trong suốt thời gian dùng gói cước qua API hoặc check trực
tiếp trên portal.

## 3HK

Hạn hiệu lực mã QR tính theo hạn sử dụng (HSD) của lô eSIM frame, không phải theo ngày tạo đơn. Số lần
quét lại CHƯA được đảm bảo đồng nhất: một số SM-DP thuộc nhóm `httk` có thể cài lại được qua thử thủ công,
nhưng một số SM-DP thuộc `acprsp.eastcompeace.com` thì không hỗ trợ cài lại — cần clarify trực tiếp với
3HK theo từng case trước khi hứa với khách. 3HK không hỗ trợ đổi thiết bị sau khi đã cài. Về hủy/hoàn
tiền, GoHub tự xử lý (3HK không can thiệp trực tiếp vào từng case lẻ). Quản lý dung lượng: check trên
portal 3HK.

## WorldMove (WM)

Hạn hiệu lực mã QR không đồng nhất giữa các mã: một số mã có HSD 30 ngày kể từ ngày tạo đơn thành công,
một số mã (ví dụ nhóm Orange) có HSD xa hơn — cần tra đúng mã đang xử lý, không mặc định 30 ngày cho mọi
SKU WM. Số lần quét lại tối đa 5 lần trên cùng thiết bị; WM không hỗ trợ đổi thiết bị sau khi đã cài. Khi
khách báo lỗi cài đặt, WM chỉ cân nhắc hoàn tiền/hỗ trợ nếu GoHub gửi đủ bằng chứng: ảnh cài đặt roaming,
băng tần, network/APN, và thông tin thiết bị — sau đó WM có thể hỗ trợ nhưng vẫn cần GoHub bấm submit yêu
cầu ở portal. Quản lý dung lượng: check portal hoặc nhắn WM qua WeChat để kiểm tra và xử lý vấn đề.

## DTac / TrueMove

Hạn hiệu lực mã QR tính theo lô. Mỗi mã chỉ được cài đặt 1 lần trên 1 thiết bị. Nếu quét mã fail trong 10
lần liên tiếp, mã sẽ hỏng vĩnh viễn và cần scan lại mã mới — nên double-check số lần fail với DTAC trước
khi kết luận mã hỏng. Điều kiện hoàn tiền/replacement: SIM phải chưa phát sinh data và chưa cài đặt thành
công; CS ghi chú "chưa có case replacement" trước, sau đó chuyển ghi chú "supplier action" khi đã báo nhà
cung cấp xử lý. Quản lý dung lượng: hỗ trợ qua email. Lưu ý riêng: những case DTac đã xác nhận replacement
nhưng đến hiện tại vẫn CHƯA RÕ khách đã nhận hàng bù hay chưa — cần theo dõi sát, đừng coi case đã đóng chỉ
vì DTac đã confirm.

## KDDI

Hạn hiệu lực mã QR tính theo lô. Chỉ được cài đặt 1 lần trên 1 thiết bị. KDDI có chính sách chặt nhất về
hoàn tiền trong các vendor: SIM còn hạn sử dụng được thì KHÔNG được xóa eSIM trước khi báo vấn đề cho
KDDI — phải báo đủ ảnh cài đặt (roaming, băng tần, network/APN, thông tin thiết bị) thì KDDI mới cân nhắc
gửi replacement cho GoHub. KDDI KHÔNG hoàn tiền (refund), chỉ gửi replacement. Quản lý dung lượng: chat
qua kênh CSKH hoặc qua email.

## Joytel

Mã QR có hạn hiệu lực 30 ngày kể từ ngày tạo đơn thành công. Số lần quét lại tối đa 5 hoặc 10 lần trên
cùng thiết bị tùy trường hợp cụ thể. Joytel không hỗ trợ đổi thiết bị sau khi đã cài. Điều kiện hoàn tiền:
SIM chưa hết hạn, chưa phát sinh data — có thể báo Joytel yêu cầu refund hoặc đổi thay theo nhu cầu khách,
có thể phát sinh phí tùy trường hợp. Quản lý dung lượng: nhắn Joytel qua WeChat để kiểm tra và xử lý vấn
đề.

## Elite

Elite KHÔNG có sản phẩm eSIM — chỉ bán SIM vật lý, nên toàn bộ chính sách về mã QR/cài đặt/đổi thiết bị ở
trên không áp dụng cho Elite.

## Billion Connect (BC)

Mã QR có hạn hiệu lực 90 ngày kể từ ngày tạo đơn thành công. Số lần quét lại tối đa 5 hoặc 10 lần trên
cùng thiết bị tùy trường hợp. BC không hỗ trợ đổi thiết bị sau khi đã cài. Có thể hủy khi SIM đã hết hạn.
Nếu khách không sử dụng được, BC hỗ trợ gửi reissue (cấp lại mã) để khách dùng ngoài trường hợp thông
thường; nếu sau khi reissue vẫn không dùng được, BC sẽ hỗ trợ refund toàn phần hoặc một phần tùy giá trị
gói của khách. Quản lý dung lượng: check portal hoặc nhắn BC qua WeChat để kiểm tra và xử lý vấn đề. Khi
cần file yêu cầu refund chính thức với BC, dùng đúng biểu mẫu "ICCID BC - Request refund" nội bộ.

## China Unicom (Hong Kong)

Hạn hiệu lực mã QR tính theo lô. Không hỗ trợ quét lại (re-install) và không hỗ trợ đổi thiết bị sau khi
cài. Điều kiện báo lỗi: SIM phải chưa hết hạn, kèm đầy đủ ảnh lỗi thật khi cài đặt — nếu đã thử fix mà vẫn
không được thì báo China Unicom, ghi rõ SIM đã phát sinh data hay chưa (note "no" nếu chưa dùng, note
"used data" nếu đã dùng một phần) để cuối tháng tổng hợp báo cáo refund với China Unicom theo lô. Quản lý
dung lượng: check portal hoặc nhắn qua nhóm China Unicom trên Zalo; khách hàng cũng có thể tự chủ động tải
app MyCUniq, đăng nhập bằng OTP để tự theo dõi dung lượng đã dùng.

## Mobifone

Hạn hiệu lực mã QR tính theo lô. Có hỗ trợ quét lại nhưng chưa xác định rõ số lần cụ thể — cần hỏi lại đối
tác khi gặp case thật. Có hỗ trợ đổi thiết bị nhưng cũng chưa rõ số lần đổi tối đa. Hoàn tiền/xử lý sự cố
xử lý qua group Zalo với đối tác Mobifone: đối tác có thể xác nhận trên group Zalo nhưng KHÔNG bù trực
tiếp ngay — sẽ bù cho khách sau. Quản lý dung lượng: có cú pháp tra cứu riêng (hỏi PIC phụ trách Mobifone
để lấy cú pháp cụ thể); các yêu cầu hỗ trợ khác cần nhắn qua Zalo.

## Skyfi

Áp dụng chính sách tương tự Mobifone: hạn hiệu lực mã QR theo lô, xử lý sự cố/hoàn tiền qua group Zalo đối
tác (xác nhận trên group nhưng không bù trực tiếp, sẽ bù sau), quản lý dung lượng cũng có cú pháp riêng và
các hỗ trợ khác cần nhắn Zalo.

## Tổng kết nhanh cho CS

Ba vendor CHẶT nhất về đổi thiết bị (không hỗ trợ dưới mọi hình thức): 3HK, WM, Joytel, BC, China Unicom.
Vendor duy nhất hỗ trợ đổi thiết bị rõ ràng có giới hạn: BC Datapool (tối đa 3 lần). Hai vendor có chính
sách hoàn tiền chặt nhất, đòi hỏi bằng chứng ảnh đầy đủ trước khi xử lý: WM và KDDI — trong đó KDDI CHỈ
gửi replacement (SIM/eSIM mới) chứ KHÔNG BAO GIỜ hoàn tiền. Elite không có eSIM nên không áp policy QR.
Khi không chắc case cụ thể thuộc diện nào, luôn hỏi lại PIC phụ trách vendor đó thay vì tự suy đoán theo
vendor khác.

Xem thêm bài [[chon-vendor|Chọn Vendor Nào?]], [[vendor-3hk|Vendor 3HK]], và
[[vendor-worldmove|Vendor WorldMove]].
