---
title: "GoHub — Tổng Quan Công Ty"
page_type: reference
department: all
tags: [company, overview, phap-nhan, kenh-ban]
aliases: ["GoHub Overview", "Giới thiệu GoHub"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# GoHub — Tổng Quan Công Ty

## Lĩnh Vực Kinh Doanh

GoHub cung cấp dịch vụ **SIM/eSIM du lịch** — mua gói cước từ các nhà cung cấp (vendor) rồi bán lại cho khách hàng cần kết nối di động khi đi nước ngoài.

**Khách hàng chủ yếu:** Khách du lịch từ nhiều quốc gia trên thế giới.

---

## Hai Pháp Nhân

| Pháp nhân | Tên | Ký tự đầu SKU | Thị trường |
|---|---|---|---|
| **GoHub JSC** | Công ty Việt Nam | `1`, `2`, `3`, `4`, `5`, `6` | Việt Nam |
| **GoHub Inc** | Công ty Mỹ | `A`, `B`, `C`, `D`, `E` | Mỹ và quốc tế |

> Xem thêm: [[products/SKU-Code-Structure#Ký Tự 1 — Pháp Nhân|SKU — Ký tự 1]]

---

## Mô Hình Kinh Doanh

### B2C (Bán lẻ trực tiếp)
Bán trực tiếp tới người dùng cuối qua các nền tảng lớn:
- **Ứng dụng thanh toán:** ShopeePay, Momo, ZaloPay
- **Du lịch:** KKday, Traveloka
- **Mạng xã hội:** TikTok Shop

### B2B (Bán buôn)
- **Wholesale:** Đối tác cấp 1
- **On Demand:** Kênh đặt hàng theo yêu cầu

---

## Nhà Cung Cấp (Vendors) Đang Hoạt Động

| Vendor | Mã | Loại báo giá | Ghi chú |
|---|---|---|---|
| WorldMove | WM | Gói cố định | 8.921 sản phẩm, thông tin APN đầy đủ |
| 3HK | 3H | Giá theo GB, phân theo vùng | 45 vùng, dùng công thức riêng |
| KDDI | KD | — | Chưa import, để sau |
| BillionConnect | BC | — | Chưa import, để sau |
| SimStore | SS | — | Chưa import, để sau |
| Viettel | VT | — | Chưa import, để sau |
| TruemovH | TM | — | Chưa import, để sau |

> Chi tiết từng vendor: [[vendors/WM-WorldMove]], [[vendors/3HK]]

---

## Các Loại Sản Phẩm

| Ký tự 2 SKU | Tên | Mô tả |
|---|---|---|
| `C` | eSIM Full | eSIM kỹ thuật số đầy đủ, không cần thẻ vật lý — **loại chính** |
| `E` | SIM Full | SIM vật lý truyền thống — **loại chính** |
| `A` | SIM/eSIM Data | Gói cước dữ liệu NCC cung cấp — chưa tích hợp profile, nhưng một số NCC (như WM) cũng cung cấp kèm eSIM đầy đủ |
| `1`, `2`, `K` | Loại hỗ trợ | Frame SKU, Datapack bổ sung, Profile |

> Loại **C** và **E** là hai loại sản phẩm chính mà GoHub bán ra thị trường. Các loại còn lại (`1`, `2`, `K`) là sản phẩm hỗ trợ nội bộ, không bán trực tiếp cho khách hàng.

---

## Cấu Trúc Sản Phẩm (4 cấp)

```
Product (8 ký tự đầu SKU)
  └── SKU (13 ký tự) — đơn vị tạo, nhập kho
       └── Listing (tên sản phẩm VN/EN cho từng kênh)
            └── Item (18–20 ký tự) — đơn vị bán trên từng kênh/đối tác
```

> Mã hóa chi tiết: [[products/SKU-Code-Structure]], [[products/Item-Code-Structure]]

---

## Quy Trình Cốt Lõi

```
Vendor gửi báo giá
  → Nhập vào hệ thống GoHub
  → Gap analysis: Vendor có gì mà GoHub chưa tạo SKU?
  → Tạo SKU → Tạo Listing → Tạo Item (đưa lên kênh bán)
  → Đồng bộ hàng ngày từ GoHub API
```

> Quy trình import: [[processes/Import-NCC]]
