---
title: "Cấu Trúc Mã SKU (13 ký tự)"
page_type: reference
department: all
tags: [sku, ma-hoa, product-code, reference]
aliases: ["SKU Code", "Mã SKU", "SKU Structure", "13 ký tự"]
created: 2026-06-13
updated: 2026-06-13
status: active
---

# Cấu Trúc Mã SKU (13 ký tự)

## Sơ Đồ Tổng Quát

```
Pos:  1    2    3 4 5    6 7    8    9 10 11    12 13
      ▼    ▼    ▼ ▼ ▼    ▼ ▼    ▼    ▼  ▼  ▼     ▼  ▼
      P    T    C C C    V V    D    A  A  A     G  G
      u    y    o o o    e e    a    m  m  m     B  B
      r    p    u u u    n n    t    o  o  o     _  _
      c    e    n n n    d d    a    u  u  u     D  D
      h         t t t    o o    P    n  n  n     a  a
      a               r r    o    t  t  t     y  y
      s                y y    l    .  .  .
      e                                A  A
```

**Ví dụ:** `1CRUS12A00107`

```
1    C    R U S    12    A    001    07
▼    ▼    ▼ ▼ ▼    ▼ ▼   ▼    ▼ ▼ ▼   ▼ ▼
VN   eSIM Russia  WM    Daily  1GB   7ngày
     Full
```

---

## Ký Tự 1 — Purchase Type (Pháp Nhân + Variant)

| Ký tự | Pháp nhân | Mô tả |
|---|---|---|
| `1` | GoHub JSC (VN) | Variant 1 |
| `2` | GoHub JSC (VN) | Variant 2 |
| `3` | GoHub JSC (VN) | Variant 3 |
| `4` | GoHub JSC (VN) | Variant 4 |
| `5` | GoHub JSC (VN) | Variant 5 |
| `6` | GoHub JSC (VN) | Variant 6 |
| `A` | GoHub Inc (US) | Variant A |
| `B` | GoHub Inc (US) | Variant B |
| `C` | GoHub Inc (US) | Variant C |
| `D` | GoHub Inc (US) | Variant D |
| `E` | GoHub Inc (US) | Variant E |

> `1`-`6` = tenant VN, `A`-`E` = tenant US

---

## Ký Tự 2 — Product Type (Loại Sản Phẩm)

| Ký tự | Tên | Mô tả |
|---|---|---|
| `C` | eSIM Full | eSIM kỹ thuật số — **loại chính** |
| `E` | SIM Full | SIM vật lý — **loại chính** |
| `1` | Frame SKU | SKU khung, không có data thật |
| `2` | Datapack | Thêm data |
| `K` | Profile | Hồ sơ kết nối (không data) |
| `A`, `B`, `D` | Các loại phụ | Ít dùng |

> **Chatbot và Gap Analysis chỉ xét C và E.**

---

## Ký Tự 3-5 — Country Code (Mã Nước/Nhóm)

GoHub dùng mã **3 ký tự** riêng (không phải ISO 2-ký-tự chuẩn quốc tế).

### Single Country (Nước đơn lẻ)

| Mã GoHub | Nước |
|---|---|
| `VNM` | Vietnam |
| `JPN` | Japan |
| `KOR` | Korea |
| `THA` | Thailand |
| `SGP` | Singapore |
| `CHM` | China + Hong Kong + Macao |
| `TWN` | Taiwan |
| `USA` | United States |
| `GBR` | United Kingdom |
| `AUS` | Australia |
| `RUS` | Russia |

### Multi-Country Groups

| Mã GoHub | Tên nhóm | Bao gồm |
|---|---|---|
| `EU1` | Europe 1 | UK, Denmark, Austria, ... |
| `APA` | Asia Pacific | ... |
| `GLO` | Global | Nhiều nước |
| `W04` | World 4 | ... |
| `SCA` | Scandinavia | ... |
| `CIS` | CIS | Nga, Ukraine, Belarus, ... |

> Danh sách đầy đủ trong DB: bảng `ref_support_countries` (77 groups)  
> Và bảng `ref_categories` (271 entries = 256 single + 15 multi)

---

## Ký Tự 6-7 — Vendor Code

| Mã | Vendor |
|---|---|
| `WM` | WorldMove |
| `3H` | 3HK |
| `BC` | BillionConnect |
| `KD` | KDDI (Japan) |
| `SS` | SimStore |
| `VT` | Viettel |
| `TM` | TruemovH |
| `12` | Ký tự 1+2 biến thể |

> Vendor chi tiết: [[vendors/WM-WorldMove]], [[vendors/3HK]]

---

## Ký Tự 8 — Data Policy Code

> Chi tiết đầy đủ: [[products/Data-Policy-Codes]]

| Mã | Loại gói | Throttle sau hết quota |
|---|---|---|
| `A` | Daily cap → Unlimited 10Mbps | 10 Mbps |
| `B` | Daily cap → Unlimited 5Mbps | 5 Mbps |
| `C` | Unlimited cố định | — |
| `D` | Unlimited, no throttle | Không throttle |
| `E` | Fixed cap → Unlimited 10Mbps | 10 Mbps |
| `F` | Fixed data, throttle nhẹ | < 2 Mbps |
| `G` | Fixed cap → Unlimited 5Mbps | 5 Mbps |
| `H` | Unlimited cố định variant | — |
| `K` | Frame/Profile, không data | — |
| `P` | Daily data, throttle nhẹ | 128 kbps |
| `Y` | No throttle variant | Không throttle |
| `Z` | No throttle variant 2 | Không throttle |

---

## Ký Tự 9-11 — Data Amount (Dung Lượng)

3 ký tự số = dung lượng GB (zero-padded).

| Giá trị | Nghĩa |
|---|---|
| `001` | 1 GB |
| `003` | 3 GB |
| `005` | 5 GB |
| `010` | 10 GB |
| `020` | 20 GB |
| `999` | Unlimited (9999 GB trong DB) |

---

## Ký Tự 12-13 — Day Amount (Số Ngày)

2 ký tự số = số ngày (zero-padded).

| Giá trị | Nghĩa |
|---|---|
| `07` | 7 ngày |
| `14` | 14 ngày |
| `30` | 30 ngày |
| `90` | 90 ngày |

---

## Quan Hệ SKU — Product Code

**Product Code = 8 ký tự đầu của SKU.**

```
SKU:     1 C RUS WM A 001 07
         ▼ ▼ ▼▼▼ ▼▼ ▼ ▼▼▼ ▼▼
Product: 1 C RUS WM
         (8 chars)
```

Tất cả SKU có cùng 8 ký tự đầu → cùng 1 Product, chỉ khác data amount và day amount.

---

## Dataview Query

```dataview
TABLE aliases, department
FROM #sku OR #ma-hoa
SORT file.name ASC
```
