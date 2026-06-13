---
title: "GoHub — Tổng Quan Công Ty"
page_type: reference
department: all
tags: [company, overview, phap-nhan, kenh-ban]
aliases: ["GoHub Overview", "Giới thiệu GoHub"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# GoHub — Tổng Quan Công Ty

## Lĩnh Vực Kinh Doanh

GoHub cung cấp dịch vụ **SIM/eSIM du lịch** — mua gói cước từ các nhà cung cấp (vendor) rồi bán lại cho khách hàng cần kết nối di động khi đi nước ngoài.

**Khách hàng chủ yếu:** Khách du lịch từ nhiều quốc gia khác nhau trên thế giới.

---

## Hai Pháp Nhân

| Pháp nhân | Tên | Ký tự đầu SKU | Thị trường |
|---|---|---|---|
| **GoHub JSC** | Công ty VN | `1`, `2`, `3`, `4`, `5`, `6` | Việt Nam (tenant=VN) |
| **GoHub Inc** | Công ty US | `A`, `B`, `C`, `D`, `E` | Mỹ + quốc tế (tenant=US) |

> Xem thêm: [[products/SKU-Code-Structure#Purchase Type (ký tự 1)|SKU — Purchase Type]]

---

## Mô Hình Kinh Doanh

### B2C (Direct to Consumer)
Bán trực tiếp tới người dùng cuối qua các nền tảng lớn:
- **App thanh toán:** ShopeePay (`SP`), Momo (`MM`), ZaloPay (`ZP`)
- **Du lịch:** KKday (`KK`), Traveloka
- **Mạng xã hội:** TikTok Shop

### B2B (Business to Business)
- **Wholesale (WS):** Đối tác cấp 1 (`T1`)
- **OD (On Demand):** Kênh đặt hàng riêng (`D`)

---

## Nhà Cung Cấp (Vendors) Đang Hoạt Động

| Vendor | Mã | Loại | Ghi chú |
|---|---|---|---|
| WorldMove | WM | Gói cố định | 8921 sản phẩm, có APN data đầy đủ |
| 3HK | 3H | Giá/GB theo zone | 45 zones, dùng formula tính COGS |
| BillionConnect | BC | — | Chưa import data, defer |
| SimStore | SS | — | Chưa import data, defer |
| Viettel | VT | — | Chưa import data, defer |
| TruemovH | TM | — | Chưa import data, defer |

> Chi tiết từng vendor: [[vendors/WM-WorldMove]], [[vendors/3HK]]

---

## Loại Sản Phẩm Chính

| Ký tự 2 SKU | Tên | Mô tả |
|---|---|---|
| `C` | eSIM Full | eSIM kỹ thuật số, không cần thẻ vật lý |
| `E` | SIM Full | SIM vật lý truyền thống |
| `1`, `2` | Các loại khác | Frame SKU, Datapack, Profile... |

**Lưu ý:** Chatbot và gap analysis **chỉ xét loại C và E** (eSIM/SIM Full).

---

## Cấu Trúc Sản Phẩm (4 cấp)

```
Product (8 ký tự đầu SKU)
  └── SKU (13 ký tự) — đơn vị tạo, nhập kho
       └── Listing (tên sản phẩm VN/EN cho từng kênh)
            └── Item (18 ký tự) — đơn vị bán trên từng kênh/partner
```

> Mã hóa chi tiết: [[products/SKU-Code-Structure]], [[products/Item-Code-Structure]]

---

## Workflow Cốt Lõi

```
Vendor gửi báo giá
  → Import vào ncc_worldmove / ncc_3hk (GoHub DB)
  → Gap analysis: NCC có gì mà GoHub chưa tạo SKU?
  → Team tạo SKU → tạo Listing → tạo Item (đưa lên kênh bán)
  → Sync daily từ GoHub API → Supabase
```

> Quy trình import: [[processes/Import-NCC]]
