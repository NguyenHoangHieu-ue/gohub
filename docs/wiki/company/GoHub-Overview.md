---
title: "GoHub — Tổng Quan Công Ty"
audience: staff
visibility: all
page_type: reference
department: all
tags: [company, overview, phap-nhan, kenh-ban, gioi-thieu]
aliases: ["GoHub Overview", "Giới thiệu GoHub", "GoHub là gì"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-08-22
status: active
---

# GoHub — Tổng Quan Công Ty

## GoHub Làm Gì?

GoHub cung cấp dịch vụ **SIM và eSIM du lịch quốc tế** — mua gói data từ các nhà mạng/vendor rồi bán lại cho khách hàng cần kết nối khi ra nước ngoài.

**Sản phẩm chính:**
- **eSIM** — cài trực tiếp qua QR/app, không cần thẻ vật lý (loại phổ biến nhất)
- **SIM vật lý** — gắn thẻ truyền thống, hỗ trợ mọi điện thoại

---

## Hai Pháp Nhân

| Pháp nhân | Tên đầy đủ | Thị trường chính | Ký tự đầu SKU |
|---|---|---|---|
| **GoHub JSC** | Công ty Cổ phần GoHub Việt Nam | Việt Nam | `1` `2` `3` `4` `5` `6` |
| **GoHub Inc** | GoHub Incorporated (Mỹ) | Mỹ và quốc tế | `A` `B` `C` `D` `E` |

---

## Kênh Bán Hàng

### B2C — Bán lẻ trực tiếp đến người dùng cuối
| Loại kênh | Ví dụ |
|---|---|
| Ví điện tử | ShopeePay, Momo, ZaloPay |
| Du lịch | KKday, Traveloka |
| Mạng xã hội | TikTok Shop |
| Website | Gohub.vn |

### B2B — Bán buôn cho đối tác
| Loại | Mô tả |
|---|---|
| **Wholesale / Strategic** | Đối tác lớn, nhập số lượng lớn, giá đặc biệt |
| **On Demand** | Đặt hàng theo yêu cầu, giá thị trường |
| **Portal** | Đối tác tự quản lý qua hệ thống |

---

## Các Nhà Cung Cấp (Vendor) Hiện Tại

| Vendor | Trạng thái | Đặc điểm |
|---|---|---|
| **WorldMove (WM)** | ✅ Chính | 8.900+ gói, phủ sóng rộng, không KYC |
| **3HK Datapool** | ✅ Chính | Giá/GB theo vùng, 45 vùng, linh hoạt |
| **KDDI** | ✅ Hạn chế | Nhật Bản, chất lượng cao |
| BillionConnect, SimStore... | ⏳ Chưa đủ | Đang phát triển |

> CS nên biết: [[pricing/Vendor-Priority|Khi nào dùng vendor nào?]]

---

## Cấu Trúc Sản Phẩm (4 Cấp)

```
Product (8 ký tự đầu SKU) — nhóm cùng loại
  └── SKU (13 ký tự) — đơn vị sản phẩm cụ thể (dung lượng, số ngày)
       └── Listing — tên hiển thị trên từng kênh (VN/EN)
            └── Item (18+ ký tự) — đơn vị bán thực tế trên kênh/đối tác
```

> CS chỉ cần biết: **SKU = gói cụ thể** khách mua. Đọc mã SKU: [[products/SKU-Code-Structure]]

---

## Quy Trình Cốt Lõi (Để CS Hiểu Luồng)

```
Vendor gửi báo giá mới
  → Team Product import vào hệ thống
  → So sánh gap: nước nào/gói nào GoHub chưa có?
  → Tạo SKU → Tạo Listing → Tạo Item trên kênh
  → CS bán sản phẩm cho KH
```

---

## Các Chỉ Số Quan Trọng (Để CS Hiểu)

| Chỉ số | Ý nghĩa | CS cần biết |
|---|---|---|
| **Revenue** | Doanh thu (giá bán × số lượng) | Mục tiêu tháng |
| **GP (Gross Profit)** | Doanh thu − Giá nhập (COGS) | Biên lợi nhuận gộp |
| **CM1** | GP − Chi phí vận hành kênh | Lợi nhuận thực sau chi phí sàn/quảng cáo |
| **3HK%** | Tỉ lệ doanh thu từ sản phẩm 3HK | KPI quan trọng của team |

> Giải thích đầy đủ: [[company/Business-Metrics-Glossary]]

---

## Liên Hệ & Câu Hỏi

- **Sản phẩm / vendor / gap:** Team Product
- **Giá / chiết khấu B2B:** BD / Sales
- **Đơn hàng / fulfillment:** Ops
- **Hệ thống / bug:** Hiếu (admin GoHub Intel)
