---
title: "Cấu Trúc Mã SKU (13 ký tự)"
page_type: reference
department: all
tags: [sku, ma-hoa, product-code, reference]
aliases: ["SKU Code", "Mã SKU", "SKU Structure", "13 ký tự"]
created: 2026-06-13
updated: 2026-06-15
status: active
---

# Cấu Trúc Mã SKU (13 ký tự)

Mã SKU là mã **13 ký tự** định danh duy nhất cho từng sản phẩm trong hệ thống GoHub. Mỗi ký tự mang thông tin cụ thể về loại sản phẩm, nước, vendor và data.

## Sơ Đồ

```
Vị trí:  1       2       3–5       6–7     8      9–11    12–13
          ▼       ▼       ▼▼▼       ▼▼      ▼      ▼▼▼     ▼▼
          Pháp   Loại   Nước/    Vendor   Data   Dung    Số
          nhân   SP     Nhóm             Policy  lượng   ngày
```

**Ví dụ:** `1CRUS12A00107`

```
1    C    R U S    1 2    A    0 0 1    0 7
▼    ▼    ▼ ▼ ▼    ▼ ▼    ▼    ▼ ▼ ▼   ▼  ▼
VN   eSIM Russia  WM     Daily  1GB    7 ngày
     Full         (WM)   1GB/d
                         cap
```

---

## Ký Tự 1 — Pháp Nhân (Purchase Type)

| Ký tự | Pháp nhân | Thị trường |
|---|---|---|
| `1` – `6` | GoHub JSC | Việt Nam |
| `A` – `E` | GoHub Inc | Mỹ và quốc tế |

> `1`–`6` = sản phẩm bán qua kênh VN &nbsp;|&nbsp; `A`–`E` = kênh US

---

## Ký Tự 2 — Loại Sản Phẩm (Product Type)

| Ký tự | Tên | Mô tả |
|---|---|---|
| `C` | eSIM Full | eSIM kỹ thuật số đầy đủ — có profile cài sẵn, bán trực tiếp cho khách &nbsp;**[loại chính]** |
| `E` | SIM Full | SIM vật lý đầy đủ — bán trực tiếp cho khách &nbsp;**[loại chính]** |
| `A` | SIM/eSIM Data | Gói cước dữ liệu NCC cung cấp — chưa tích hợp profile riêng, nhưng một số NCC (như WM) cũng cung cấp kèm eSIM đầy đủ |
| `1` | Frame SKU | Mã khung — không có data thật, dùng làm template |
| `2` | Datapack | Gói bổ sung data thêm (add-on) |
| `K` | Profile | Hồ sơ kết nối riêng — không kèm data |
| `B`, `D` | Loại khác | Ít sử dụng |

> **Chatbot và gap analysis chỉ xét loại C và E** (eSIM/SIM Full bán được ngay).

---

## Ký Tự 3–5 — Mã Nước / Nhóm Nước

GoHub dùng mã **3 ký tự riêng** (không phải mã ISO chuẩn quốc tế).

### Nước đơn lẻ

| Mã GoHub | Nước |
|---|---|
| `VNM` | Việt Nam |
| `JPN` | Nhật Bản |
| `KOR` | Hàn Quốc |
| `THA` | Thái Lan |
| `SGP` | Singapore |
| `CHM` | Trung Quốc + Hồng Kông + Macao |
| `TWN` | Đài Loan |
| `USA` | Hoa Kỳ |
| `GBR` | Vương quốc Anh |
| `AUS` | Úc |
| `RUS` | Nga |

### Nhóm đa quốc gia

| Mã GoHub | Tên nhóm | Ghi chú |
|---|---|---|
| `EU1` | Europe 1 | Anh, Đan Mạch, Áo... |
| `APA` | Asia Pacific | Khu vực châu Á - Thái Bình Dương |
| `GLO` | Global | Nhiều nước trên thế giới |
| `W04` | World 4 | Nhóm đặc biệt |
| `SCA` | Scandinavia | Bắc Âu |
| `CIS` | CIS | Nga, Ukraine, Belarus... |

> GoHub có **77 nhóm nước** và **271 mã quốc gia** — xem đầy đủ trong tab Thông tin trên web.

---

## Ký Tự 6–7 — Vendor

| Mã | Vendor |
|---|---|
| `WM` | WorldMove |
| `3H` | 3HK |
| `BC` | BillionConnect |
| `KD` | KDDI (Nhật) |
| `SS` | SimStore |
| `VT` | Viettel |
| `TM` | TruemovH |

> Chi tiết từng vendor: [[vendors/WM-WorldMove]], [[vendors/3HK]]

---

## Ký Tự 8 — Loại Data (Data Policy)

> Giải thích chi tiết: [[products/Data-Policy-Codes]]

| Mã | Loại gói | Tốc độ tối thiểu sau hết quota |
|---|---|---|
| `A` | Daily cap, tốc độ tối thiểu 10 Mbps | 10 Mbps |
| `B` | Daily cap, tốc độ tối thiểu 5 Mbps | 5 Mbps |
| `C` | Unlimited cố định | — |
| `D` | True Unlimited — không giảm tốc | Không giới hạn |
| `E` | Fixed data, sau đó tốc độ tối thiểu 10 Mbps | 10 Mbps |
| `F` | Fixed data, sau đó tốc độ rất chậm | Dưới 2 Mbps |
| `G` | Fixed data, sau đó tốc độ tối thiểu 5 Mbps | 5 Mbps |
| `H` | Unlimited cố định (biến thể 2) | — |
| `K` | Mã khung / Profile — không có data | — |
| `P` | Data theo ngày, tốc độ chậm sau hết quota ngày | 128 kbps |
| `Y` | Fixed data, không giảm tốc | Không giới hạn |
| `Z` | Fixed data, không giảm tốc (biến thể 2) | Không giới hạn |

---

## Ký Tự 9–11 — Dung Lượng Data

3 chữ số = dung lượng GB.

| Giá trị | Nghĩa |
|---|---|
| `001` | 1 GB |
| `003` | 3 GB |
| `005` | 5 GB |
| `010` | 10 GB |
| `020` | 20 GB |
| `999` | Không giới hạn (Unlimited) |

---

## Ký Tự 12–13 — Số Ngày

2 chữ số = số ngày hiệu lực.

| Giá trị | Nghĩa |
|---|---|
| `07` | 7 ngày |
| `14` | 14 ngày |
| `30` | 30 ngày |
| `90` | 90 ngày |

---

## Quan Hệ SKU và Product Code

**Product Code = 8 ký tự đầu của SKU.**

```
SKU:      1  C  R U S  W M  A  0 0 1  0 7
          ▼  ▼  ▼▼▼    ▼▼   ▼  ▼▼▼    ▼▼
Product:  1  C  R U S  W M
          (8 ký tự đầu)
```

Tất cả SKU có cùng 8 ký tự đầu thuộc cùng 1 Product — chỉ khác nhau ở dung lượng và số ngày.
