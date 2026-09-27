---
title: "Chọn Vendor Nào? — Hướng Dẫn Nhanh"
audience: cs-product
visibility: all
page_type: pricing_rule
department: cs-sale
tags: [vendor, priority, wm, 3hk, kddi, tu-van, chon-vendor]
aliases: ["Vendor Priority", "Chọn Vendor", "Ưu tiên vendor", "Dùng vendor nào"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-27
status: active
---

# Chọn Vendor Nào? — Hướng Dẫn Nhanh

## Thứ tự ưu tiên chung (chốt 2026-09-27, thay quy tắc "thử WM trước" cũ)

1. **3HK** — ưu tiên cao nhất.
2. **BC Datapool** (`WD`/`W1`) — ưu tiên thứ hai.
3. **Sản phẩm có kèm số điện thoại nội địa (local phone number)** — ưu tiên thứ ba, bất kể vendor nào cung
   cấp, vì khách có nhu cầu này thường không đổi được sang gói không có SĐT local.
4. **Các sản phẩm khác** (WM, BC thường, SimStore, TruemoveH, Joytel, Elite...) — dùng khi ba nhóm trên
   không đáp ứng được.

Riêng **Nhật Bản luôn dùng KDDI** (partnership riêng, chất lượng mạng cao nhất) — không nằm trong thứ tự
trên, xét trước tiên khi khách hỏi Nhật.

**Ngoại lệ đang áp dụng thực tế (tạm thời, do giá — không phải đổi thứ tự ưu tiên gốc)**: một số nước 3HK
yêu cầu KYC còn WM/BC-Singtel (`W1`) thì không — ví dụ Đài Loan, Hong Kong. Hiện giá WM đang rẻ hơn
BC-Singtel nên team đang dùng WM cho các nước này thay vì BC-Singtel, dù cả hai đều "sản phẩm khác" (ưu
tiên thứ tư) và đứng sau 3HK/BC Datapool về nguyên tắc. **Khi BC Datapool được đưa vào target** (Hiếu xác
nhận sẽ làm, chưa có mốc cụ thể), thứ tự áp dụng đúng như trên: 3HK → BC-Datapool → các sản phẩm khác — bỏ
ngoại lệ WM này.

## Sơ đồ quyết định nhanh

Khi khách hỏi về một nước, trước tiên kiểm tra có phải Nhật Bản không — nếu đúng thì dùng KDDI. Với các
nước khác, kiểm tra GoHub đã có SKU sẵn chưa: nếu đã có thì bán SKU đó luôn, không cần tra vendor. Nếu
chưa có SKU thì kiểm tra theo đúng thứ tự ưu tiên ở trên — 3HK có phủ vùng đó không, rồi đến BC Datapool,
rồi đến sản phẩm có SĐT local nếu khách cần, cuối cùng mới xét WM/BC thường/vendor phụ khác; nếu không nhóm
nào có thì báo team Product tạo sản phẩm mới. Với Đài Loan/Hong Kong, áp dụng ngoại lệ giá ở trên (dùng WM)
cho đến khi BC Datapool vào target.

## Bảng tham chiếu nhanh theo nước

Nhật Bản ưu tiên KDDI nhờ partnership riêng và chất lượng mạng cao nhất, không theo thứ tự chung. Đài Loan
và Hong Kong: 3HK cần KYC nên hiện đang dùng WM (ngoại lệ giá, xem trên) thay vì theo đúng thứ tự 3HK → BC
Datapool. Các nước khác áp dụng đúng thứ tự chung: 3HK trước, không có thì BC Datapool, không có thì xét
sản phẩm có SĐT local nếu khách cần, cuối cùng mới đến WM hoặc vendor phụ khác.

## Khi nhiều vendor cùng có gói — thứ tự chọn

Áp dụng thứ tự ưu tiên chung ở trên trước (3HK → BC Datapool → SĐT local → sản phẩm khác). Trong cùng một
nhóm ưu tiên, nếu vẫn có nhiều lựa chọn: ưu tiên gói đặc thù cho đúng nước hơn gói khu vực, và gói khu vực
hơn gói toàn cầu — gói càng cụ thể thì chất lượng càng tốt. Giá nhập thấp hơn cho biên lợi nhuận cao hơn,
nhưng KHÔNG dùng giá để vượt qua thứ tự ưu tiên chung (đây chính là lý do ngoại lệ WM ở Đài Loan/HK đang
được xem là tạm thời, không phải quy tắc lâu dài).

## Phân biệt ba trường hợp "không có"

Nếu GoHub chưa tạo SKU nhưng vendor có gói, nói với khách: "Hiện bên em chưa có sản phẩm cụ thể cho nhu
cầu này, em sẽ hỗ trợ tìm thêm" — rồi báo team Product tạo SKU. Nếu vendor ưu tiên (3HK/BC Datapool) không
có gói cho nước đó, nói: "Để em kiểm tra thêm nhà cung cấp khác" — rồi chuyển xuống nhóm ưu tiên tiếp theo.
Nếu không nhóm nào có, nói: "GoHub hiện chưa có dịch vụ cho nước này" — rồi ghi nhận nhu cầu và báo BD.
Tuyệt đối không nói "hết hàng" hay "vendor không có" khi thực ra GoHub chỉ chưa tạo SKU — đây là hai việc
hoàn toàn khác nhau.

## Trạng thái từng vendor

WorldMove (mã SKU `WM`) đang hoạt động đầy đủ với 8.921 gói. 3HK Datapool (mã SKU `3D`) đang hoạt động đầy
đủ với 45 vùng giá. KDDI (mã SKU `KD`) hoạt động cho Nhật Bản theo partnership, phạm vi giới hạn.
BillionConnect (mã `BC`), SimStore (mã `SS`), TruemoveH (mã `TM`), Joytel (mã `JY`), và Elite (mã `EL`)
đều là vendor phụ, dùng khi WM/3HK/KDDI không đáp ứng được.

## Phân biệt Billion Connect (BC) và BC Datapool (WD / W1)

Đừng gộp chung "BC" với "BC Datapool" — đây là hai dòng sản phẩm khác nhau của cùng một hãng Billion
Connect, mã SKU khác hẳn nhau: `BC` là dòng tiêu chuẩn/gói cố định; `WD` và `W1` đều là BC Datapool (dòng
tính giá linh hoạt theo GB, giống mô hình 3HK) nhưng tách theo nhà mạng nền — `WD` chạy trên hạ tầng CMHK,
`W1` chạy trên Singtel. Khi khách hoặc nội bộ hỏi "BC" thì hiểu là dòng cố định (`BC`); khi hỏi "BC
Datapool" hoặc "WD" thì hiểu là dòng linh hoạt (`WD`/`W1`) — không gộp chung khi tra COGS, sản lượng, hay
GP%, vì công thức tính và giá vốn hoàn toàn khác nhau.

## Chính sách QR / đổi thiết bị / hủy hoàn tiền theo vendor

Mỗi vendor có quy định riêng về hạn dùng mã QR kích hoạt, số lần được cài lại/đổi thiết bị, và điều kiện
hủy/hoàn tiền — CS bắt buộc nắm trước khi tư vấn hoặc xử lý khiếu nại. Xem đầy đủ ở bài
[[chinh-sach-vendor|Chính Sách Vendor: QR, Đổi Thiết Bị, Hủy/Hoàn Tiền]].

Xem thêm bài [[vendor-worldmove|Chi tiết vendor WM]], [[vendor-3hk|Chi tiết vendor 3HK]],
[[combo-chuan|42 combo chuẩn GoHub theo nước]], và [[cong-thuc-gia-3hk|Tính giá 3HK]].
