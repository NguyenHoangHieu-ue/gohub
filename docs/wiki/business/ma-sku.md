---
title: "Cấu Trúc Mã SKU (13 ký tự)"
page_type: reference
department: all
audience: cs-product
visibility: all
tags: [sku, ma-hoa, product-code, reference, tu-van]
aliases: ["SKU Code", "Mã SKU", "SKU Structure", "13 ký tự"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-09-04
status: active
---

# Cấu Trúc Mã SKU (13 ký tự)

Mã SKU là mã 13 ký tự định danh duy nhất cho từng sản phẩm trong hệ thống GoHub. Chỉ cần đọc đúng cách,
một mã SKU cho biết ngay gói đó thuộc pháp nhân nào, bán ở nước nào, từ vendor nào, bao nhiêu GB, và bao
nhiêu ngày. Ví dụ `3CUSAGBY00507` giải mã ra: pháp nhân VN company, loại eSIM Full, nước USA, vendor WM,
loại data Fixed no-throttle, dung lượng 5GB, thời hạn 7 ngày.

Mã SKU ghép theo trình tự: ký tự thứ nhất là pháp nhân/kênh mua (PurchaseType), ký tự thứ hai là loại sản
phẩm (ProductType), ba ký tự tiếp theo (vị trí 3-5) là mã nước hoặc nhóm nước, hai ký tự kế (vị trí 6-7)
là mã vendor, ký tự thứ tám là loại data, ba ký tự tiếp theo (vị trí 9-11) là dung lượng, và hai ký tự
cuối (vị trí 12-13) là số ngày.

Một vài ví dụ giải mã đầy đủ: `3CUSAGBY00507` là VN company, eSIM Full, nước USA, vendor GB (WM), loại
Fixed no-throttle, 5GB, 7 ngày. `DCUSAGBY00507` là US company, eSIM Full, nước USA, vendor GB, Fixed
no-throttle, 5GB, 7 ngày. `DCAUSGBY06530` là US company, eSIM Full, nước AUS, vendor GB, Fixed
no-throttle, 65GB, 30 ngày.

Product Code chính là 8 ký tự đầu của SKU Code — ví dụ với `3CUSAGBY00507`, Product Code là `3CUSAGBY`.

## Ký tự 1 — Pháp nhân và phương thức mua

Với pháp nhân VN Company (GoHub JSC, tenant VN): ký tự `1` nghĩa là VN Stock Direct, `2` là VN Stocks -
Internal GHI, `3` là VN Monthly Invoice Internal GHI, `4` là VN Telco Balance, `5` là VN Datapool, `6` là
VN Others.

Với pháp nhân US Company (GoHub Inc, tenant US): ký tự `A` nghĩa là US Stock Direct, `B` là US Stock -
Internal GHV, `C` là US Monthly Invoice Internal GHV, `D` là US Telco Balance, `E` là US Datapool.

Nhóm Special dành riêng cho VN, cũng dùng ký tự số: `1` nghĩa là eSIM full dùng nội địa Việt Nam, `2` là
SIM full dùng nội địa Việt Nam, `3` là phí ship (Shipping Fees), `4` là dịch vụ khác chịu VAT (Other VAT
services).

## Ký tự 2 — Loại sản phẩm

`A` là SIM/eSIM data, gói dữ liệu từ NCC. `B` là eSIM profile, hồ sơ eSIM chưa có data. `C` là eSIM full,
bản đầy đủ khách cài trực tiếp. `D` là SIM frame, mã khung SIM vật lý. `E` là SIM full, bản SIM vật lý đầy
đủ. `F` là phí ship. `G` là quà tặng (Gifts). `H` là loại khác (Others). Hai loại chính bán ra thị trường
là `C` (eSIM full) và `E` (SIM full).

## Ký tự 3–5 — Mã nước (3 ký tự GoHub, không phải chuẩn ISO)

Với nước đơn lẻ, một số mã phổ biến: `VNM` là Việt Nam, `JPN` là Nhật Bản, `KOR` là Hàn Quốc, `THA` là
Thái Lan, `SGP` là Singapore, `CHM` là Trung Quốc gộp Hồng Kông và Macao, `TWN` là Đài Loan, `USA` là Hoa
Kỳ, `GBR` là Vương quốc Anh, `AUS` là Úc, `CAN` là Canada, `BRA` là Brazil, `GUM` là Guam.

Với nhóm đa quốc gia, một số ví dụ: `EU1` là Europe 1, `APA` là Asia Pacific, `GLO` là Global.

Mã đặc biệt `000` dùng cho eSIM profile hoặc SIM frame — không gắn với nước cụ thể nào.

GoHub hiện có 77 nhóm nước và 271 mã quốc gia; danh sách đầy đủ xem trong tab Thông tin trên web.

## Ký tự 6–7 — Mã vendor

`GB` là WorldMove (mã nội bộ GoHub, không phải viết tắt tên vendor). `3D` là 3HK Datapool. `BC` là Billion
Connect. `JY` là Joytel. `KD` là KDDI (Nhật). `TM` là TruemoveH. `SS` là SimStore.

## Ký tự 8 — Loại data và throttle

`A` là Daily - Unlimited 5mbps (tốc độ cao hết quota thì giảm về 5 Mbps). `B` là Daily - Unlimited 10mbps
(giảm về 10 Mbps). `C` là Unlimited 20mbps. `D` là Unlimited 100mbps, tức True Unlimited tốc độ cao nhất.
`E` là Fixed - Unlimited 5mbps. `F` là Fixed throttle dưới 2mbps (hết quota giảm xuống dưới 2 Mbps). `G`
là Unlimited 10mbps. `H` là Unlimited 5mbps. `K` dùng cho eSIM profile và SIM frame, không có data thật.
`L` là Unlimited 50mbps. `P` là Daily throttle dưới 2mbps. `T` là Daily throttle dưới 2mbps, reset lúc
nửa đêm (Midnight). `X` là Daily Unlimited 10mbps, reset lúc nửa đêm. `Y` là Fixed no-throttle, hết quota
vẫn giữ tốc độ bình thường. `Z` là Daily no-throttle. Chi tiết từng loại data policy xem ở bài
[[loai-data-policy|Data Policy Codes]].

## Ký tự 9–11 — Dung lượng data

Có bốn cách mã hoá dung lượng ở ba ký tự này. Dạng số thuần (`NNN`) như `001`, `005`, `015`, `065`, `100`
nghĩa là N GB — tức 1GB, 5GB, 15GB, 65GB, 100GB. Dạng nhân trăm MB (`NHM`) như `1HM`, `5HM` nghĩa là N
nhân 100 MB — tức 100MB, 500MB. Dạng số thập phân GB (`NDN`) như `0D5`, `0D8`, `1D5` nghĩa là N.N GB —
tức 0.5GB, 0.8GB, 1.5GB. Và mã `UNL` nghĩa là Unlimited.

## Ký tự 12–13 — Số ngày

Hai ký tự số, đệm số 0 phía trước khi cần: `03` là 3 ngày, `05` là 5 ngày, `07` là 7 ngày, `10` là 10
ngày, `14` là 14 ngày, `15` là 15 ngày, `30` là 30 ngày, `60` là 60 ngày, `90` là 90 ngày.

## Quan hệ giữa SKU, Product và Item

Product Code dài 8 ký tự, dùng để nhóm các gói cùng loại — cùng nước, cùng vendor, cùng DataType. SKU Code
dài 13 ký tự, là đơn vị sản phẩm thật, phân biệt theo dung lượng và số ngày. Item Code (còn gọi là Alias)
dài từ 18 ký tự trở lên, là đơn vị bán thực tế, gắn với một kênh và một đối tác cụ thể. Cấu trúc chi tiết
của mã Item/Alias xem ở bài [[ma-item-alias|Cấu Trúc Mã Item & Alias]].
