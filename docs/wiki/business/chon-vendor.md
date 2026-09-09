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
updated: 2026-09-04
status: active
---

# Chọn Vendor Nào? — Hướng Dẫn Nhanh

Nguyên tắc chung: thử WM trước, nếu không có thì chuyển sang 3HK, riêng Nhật Bản luôn dùng KDDI, và chỉ
xét đến BC hoặc JY khi cả WM lẫn 3HK đều không đáp ứng được.

## Sơ đồ quyết định nhanh

Khi khách hỏi về một nước, trước tiên kiểm tra có phải Nhật Bản không — nếu đúng thì dùng KDDI. Nếu là
Hong Kong hoặc Đài Loan thì dùng WM (không cần KYC, giá tốt). Với các nước khác, kiểm tra GoHub đã có SKU
sẵn chưa: nếu đã có thì bán SKU đó luôn, không cần tra vendor. Nếu chưa có SKU thì kiểm tra WM có gói
không — có thì dùng WM; không có thì kiểm tra 3HK có phủ vùng đó không — có thì dùng 3HK; nếu cả hai đều
không có thì xét đến BC hoặc JY, đồng thời báo team Product tạo sản phẩm mới.

## Bảng tham chiếu nhanh theo nước

Hong Kong ưu tiên WM vì không KYC, giá cạnh tranh, và phủ sóng rất tốt. Đài Loan cũng ưu tiên WM vì không
KYC và phủ sóng tốt. Nhật Bản ưu tiên KDDI nhờ partnership riêng và chất lượng mạng cao nhất. Hàn Quốc có
thể dùng WM hoặc 3HK tùy gói, cần so sánh giá và data policy cụ thể. Singapore, Thái, Malaysia và các nước
tương tự dùng WM nếu có gói tốt, còn không thì chuyển 3HK. Châu Âu và Mỹ dùng WM cho các nước chính, 3HK
bổ sung cho phần còn lại. Những nước hiếm hoặc ít phổ biến nên ưu tiên 3HK vì phủ sóng rộng hơn WM cho các
nước nhỏ.

## Khi nhiều vendor cùng có gói — thứ tự chọn

Ưu tiên vendor có giá nhập thấp hơn vì cho biên lợi nhuận cao hơn. Ưu tiên gói đặc thù cho đúng nước hơn
gói khu vực, và gói khu vực hơn gói toàn cầu — gói càng cụ thể thì chất lượng càng tốt. Cuối cùng, ưu tiên
vendor không cần KYC nếu giá tương đương, vì khách dễ mua hơn.

## Phân biệt ba trường hợp "không có"

Nếu GoHub chưa tạo SKU nhưng vendor có gói, nói với khách: "Hiện bên em chưa có sản phẩm cụ thể cho nhu
cầu này, em sẽ hỗ trợ tìm thêm" — rồi báo team Product tạo SKU. Nếu vendor không có gói cho nước đó, nói:
"WM chưa có, em kiểm tra thêm nhà cung cấp khác" — rồi chuyển sang 3HK hoặc BC. Nếu cả WM lẫn 3HK đều
không có, nói: "GoHub hiện chưa có dịch vụ cho nước này" — rồi ghi nhận nhu cầu và báo BD. Tuyệt đối không
nói "hết hàng" hay "vendor không có" khi thực ra GoHub chỉ chưa tạo SKU — đây là hai việc hoàn toàn khác
nhau.

## Trạng thái từng vendor

WorldMove (mã SKU `GB`) đang hoạt động đầy đủ với 8.921 gói. 3HK Datapool (mã SKU `3D`) đang hoạt động đầy
đủ với 45 vùng giá. KDDI (mã SKU `KD`) hoạt động cho Nhật Bản theo partnership, phạm vi giới hạn.
BillionConnect (mã `BC`), SimStore (mã `SS`), TruemoveH (mã `TM`), và Viettel (mã `VT`) đều chưa triển
khai đầy đủ hoặc chưa triển khai.

Xem thêm bài [[vendor-worldmove|Chi tiết vendor WM]], [[vendor-3hk|Chi tiết vendor 3HK]],
[[combo-chuan|42 combo chuẩn GoHub theo nước]], và [[cong-thuc-gia-3hk|Tính giá 3HK]].
