---
title: "Vendor WorldMove (WM) — Hướng Dẫn Tư Vấn"
audience: cs-product
visibility: all
page_type: vendor_profile
department: cs-sale
tags: [vendor, worldmove, wm, apn, esim, sim, tu-van]
aliases: ["WorldMove", "WM", "WORLDMOVE"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-08-22
status: active
---

# Vendor WorldMove (WM) — Hướng Dẫn Tư Vấn

> **TL;DR — Đọc nhanh:** WM là vendor chính, có 8.900+ gói, phủ sóng hầu hết các nước, không cần KYC. **Luôn thử WM trước** khi xét vendor khác. CS chỉ cần biết 5 loại gói và cách giải thích cho KH.

---

## WM Là Lựa Chọn Đầu Tiên Khi Nào?

**Dùng WM trước** cho tất cả các nước, **ngoại trừ:**

| Ngoại lệ | Thay bằng |
|---|---|
| Nhật Bản | KDDI (partnership riêng, chất lượng cao hơn) |
| Nước không có trong WM | 3HK |
| WM có nhưng giá kém cạnh tranh hơn 3HK | 3HK |

---

## 5 Loại Gói WM — CS Cần Nắm

| Loại | Tốc độ sau hết quota | Giải thích ngắn cho KH | Phù hợp khi |
|---|---|---|---|
| **Titanium AYCE** | Không giảm (true unlimited) | "Dùng thoải mái, tốc độ không đổi cả chuyến" | KH cần stream nhiều, làm việc online |
| **Premium Unlimited** | 10 Mbps sau 1GB/ngày | "Tốc độ cao 1GB/ngày, sau đó vẫn dùng được bình thường" | KH du lịch, dùng vừa phải |
| **Standard Unlimited** | 5 Mbps sau 2GB/ngày | "2GB tốc độ cao mỗi ngày, sau đó 5Mbps — đủ dùng" | KH phổ thông, ngân sách vừa |
| **Fixed Data** | 128 kbps | "Tổng [X]GB, hết thì vẫn kết nối được nhẹ" | Du lịch ngắn ngày, biết nhu cầu |
| **Daily Data** | 128 kbps | "[X]GB mỗi ngày, reset lúc nửa đêm" | KH muốn dùng đều hàng ngày |

> Mã data policy tương ứng: [[products/Data-Policy-Codes]]

---

## Câu Hỏi Thường Gặp Từ KH (Q&A Copy-Paste)

**Q: Gói có dùng được ở [nước] không?**
> "Dạ WM phủ sóng [nước] qua mạng [nhà mạng địa phương]. Em kiểm tra ngay trong hệ thống — anh/chị cần [SIM hay eSIM]?"

**Q: SIM hay eSIM, cái nào tốt hơn?**
> "eSIM tiện hơn vì cài trực tiếp trên điện thoại, không cần chờ giao hàng. Điện thoại từ iPhone XS (2018) hoặc Android hỗ trợ eSIM là dùng được. Còn lại thì dùng SIM vật lý."

**Q: Hết data thì sao?**
> "Tùy gói: gói Unlimited vẫn dùng được với tốc độ thấp hơn. Gói Fixed/Daily vẫn kết nối được nhẹ (128 kbps — đủ chat, không stream được)."

**Q: Cài đặt APN như thế nào?**
> "Đa số điện thoại tự cài khi gắn SIM hoặc cài eSIM. Nếu cần nhập tay, em gửi thông tin APN riêng cho gói đó."

**Q: Gói có KYC không (cần đăng ký giấy tờ)?**
> "Gói WM **không cần KYC** — anh/chị cài là dùng được ngay, không cần gửi CCCD hay hộ chiếu."

---

## Thông Tin APN (Hỗ Trợ KH Cài Tay)

Mỗi gói WM có APN riêng. Tra APN đúng tại: tab **Danh mục SKU → tìm mã SKU → xem APN**.

| Nhà mạng VN phổ biến | APN thường gặp |
|---|---|
| Mobifone | `m-wap` |
| Viettel | `v-internet` |

> Lưu ý: APN thay đổi theo gói và nước — luôn tra trong hệ thống, không nhớ cứng.

---

## Lưu Ý Khi Tư Vấn

- ✅ WM **không yêu cầu KYC** — lợi thế lớn, nhấn mạnh với KH
- ✅ 8.921 gói — hầu hết nước đều có
- ✅ Thông tin APN đầy đủ cho từng gói
- ⚠️ Kiểm tra **eSIM hay SIM** trước khi chốt (không phải gói nào cũng có cả hai)
- ⚠️ WM là "phủ rộng" — nếu KH cần chất lượng cao nhất ở Nhật → dùng KDDI

---

## Thông Tin Kỹ Thuật (Cho Team Product / BD)

| Thuộc tính | Giá trị |
|---|---|
| Mã vendor trong SKU (vị trí 6–7) | `GB` (mã nội bộ GoHub cho WM) |
| Loại báo giá | Gói cố định (không tính theo GB như 3HK) |
| Tổng sản phẩm hiện có | 8.921 gói |
| Yêu cầu KYC | Không |

**Format file báo giá:** GoHub Standard XLSX, sheet "Goi co san". Tải template tại **SP Vendor → Tải template**.

Gap analysis tự động: tab **SP Vendor → WM → Bộ lọc "Chưa có trong HT"**.

---

## Xem Thêm

- [[pricing/Vendor-Priority|Khi nào WM vs 3HK vs KDDI?]]
- [[products/SKU-Code-Structure|Đọc mã SKU]]
- [[products/Data-Policy-Codes|Các mã data policy (A/B/C/D...)]]
- [[processes/Import-NCC|Quy trình import báo giá WM]]
