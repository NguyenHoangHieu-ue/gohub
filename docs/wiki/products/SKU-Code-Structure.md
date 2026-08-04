---
title: "Cấu Trúc Mã SKU (13 ký tự)"
page_type: reference
department: all
tags: [sku, ma-hoa, product-code, reference]
aliases: ["SKU Code", "Mã SKU", "SKU Structure", "13 ký tự"]
created: 2026-06-13
updated: 2026-08-04
status: active
---

# Cấu Trúc Mã SKU (13 ký tự)

Mã SKU là mã **13 ký tự** định danh duy nhất cho từng sản phẩm trong hệ thống GoHub. Cấu trúc:

```
SKU CODE = [PurchaseType][ProductType][Country(3)][Vendor(2)][DataType][DataAmount(3)][DayAmount(2)]
```

| Vị trí | 1 | 2 | 3–5 | 6–7 | 8 | 9–11 | 12–13 |
|---|---|---|---|---|---|---|---|
| **Ý nghĩa** | Pháp nhân / Kênh mua | Loại sản phẩm | Nước / Nhóm nước | Vendor | Loại data | Dung lượng | Số ngày |

---

## Ví Dụ Giải Mã

| SKU | Giải mã |
|---|---|
| `3CUSAGBY00507` | VN company / eSIM Full / USA / GB vendor / Fixed no-throttle / 5GB / 7 ngày |
| `DCUSAGBY00507` | US company / eSIM Full / USA / GB vendor / Fixed no-throttle / 5GB / 7 ngày |
| `DCAUSGBY06530` | US company / eSIM Full / AUS / GB vendor / Fixed no-throttle / 65GB / 30 ngày |

**Product Code = 8 ký tự đầu của SKU Code.**  
Ví dụ: `3CUSAGBY00507` → Product Code = `3CUSAGBY`

---

## Ký Tự 1 — PurchaseType (Pháp nhân & Phương thức mua)

### VN Company (GoHub JSC — tenant = VN)
| Ký tự | Ý nghĩa |
|---|---|
| `1` | VN Stock Direct |
| `2` | VN Stocks - Internal GHI |
| `3` | VN Monthly Invoice Internal GHI |
| `4` | VN Telco Balance |
| `5` | VN Datapool |
| `6` | VN Others |

### US Company (GoHub Inc — tenant = US)
| Ký tự | Ý nghĩa |
|---|---|
| `A` | US Stock Direct |
| `B` | US Stock - Internal GHV |
| `C` | US Monthly Invoice Internal GHV |
| `D` | US Telco Balance |
| `E` | US Datapool |

### Special (VN-only, các mã số)
| Ký tự | Ý nghĩa |
|---|---|
| `1` | eSIM full used in Vietnam |
| `2` | SIM full used in Vietnam |
| `3` | Shipping Fees |
| `4` | Other VAT services |

---

## Ký Tự 2 — ProductType (Loại sản phẩm)

| Ký tự | Tên | Mô tả |
|---|---|---|
| `A` | SIM/eSIM data | Gói dữ liệu từ NCC |
| `B` | eSIM profile | Hồ sơ eSIM không có data |
| `C` | eSIM full | eSIM đầy đủ — khách cài trực tiếp |
| `D` | SIM frame | Mã khung SIM vật lý |
| `E` | SIM full | SIM vật lý đầy đủ |
| `F` | Phí ship | Phí vận chuyển |
| `G` | Gifts | Quà tặng |
| `H` | Others | Loại khác |

> **Hai loại chính bán ra thị trường:** C (eSIM full) và E (SIM full).

---

## Ký Tự 3–5 — Country Code (3 ký tự GoHub — không phải ISO chuẩn)

### Nước đơn lẻ (ví dụ phổ biến)
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
| `CAN` | Canada |
| `BRA` | Brazil |
| `GUM` | Guam |

### Nhóm đa quốc gia (ví dụ)
| Mã GoHub | Tên nhóm |
|---|---|
| `EU1` | Europe 1 |
| `APA` | Asia Pacific |
| `GLO` | Global |

### Đặc biệt
| Mã | Ý nghĩa |
|---|---|
| `000` | eSIM profile / SIM frame (không gắn nước cụ thể) |

> GoHub có **77 nhóm nước** và **271 mã quốc gia** — xem đầy đủ trong tab Thông tin trên web.

---

## Ký Tự 6–7 — Vendor Code (2 ký tự)

| Mã | Vendor |
|---|---|
| `GB` | WorldMove (WM) — mã nội bộ GoHub |
| `3D` | 3HK Datapool |
| `BC` | Billion Connect |
| `JY` | Joytel |
| `KD` | KDDI (Nhật) |
| `TM` | TruemoveH |
| `SS` | SimStore |

---

## Ký Tự 8 — DataType (Loại data + throttle)

| Mã | Tên đầy đủ |
|---|---|
| `A` | Daily - Unlimited 5mbps (high speed hết quota → 5 Mbps) |
| `B` | Daily - Unlimited 10mbps (high speed hết quota → 10 Mbps) |
| `C` | Unlimited 20mbps |
| `D` | Unlimited 100mbps (True Unlimited cao) |
| `E` | Fixed - Unlimited 5mbps |
| `F` | Fixed throttle < 2mbps (hết quota → < 2 Mbps) |
| `G` | Unlimited 10mbps |
| `H` | Unlimited 5mbps |
| `K` | For eSIM profile and SIM frame (không có data) |
| `L` | Unlimited 50mbps |
| `P` | Daily throttle < 2mbps |
| `T` | Daily throttle < 2mbps - Midnight (reset lúc nửa đêm) |
| `X` | Daily Unlimited 10mbps - Midnight |
| `Y` | Fixed no-throttle (hết quota vẫn tốc độ bình thường) |
| `Z` | Daily no-throttle |

> Chi tiết từng data policy: [[products/Data-Policy-Codes]]

---

## Ký Tự 9–11 — DataAmount (Dung lượng, 3 ký tự)

Có 4 cách mã hóa:

| Pattern | Ví dụ | Nghĩa |
|---|---|---|
| `NNN` (số) | `001` `005` `015` `065` `100` | N GB (1GB, 5GB, 15GB, 65GB, 100GB) |
| `NHM` (×100 MB) | `1HM` `5HM` | N×100 MB (100MB, 500MB) |
| `NDN` (decimal GB) | `0D5` `0D8` `1D5` | N.N GB (0.5GB, 0.8GB, 1.5GB) |
| `UNL` | `UNL` | Unlimited |

---

## Ký Tự 12–13 — DayAmount (Số ngày, 2 ký tự số, padded)

| Giá trị | Nghĩa |
|---|---|
| `03` | 3 ngày |
| `05` | 5 ngày |
| `07` | 7 ngày |
| `10` | 10 ngày |
| `14` | 14 ngày |
| `15` | 15 ngày |
| `30` | 30 ngày |
| `60` | 60 ngày |
| `90` | 90 ngày |

---

## Quan Hệ SKU — Product — Item Code

| Mã | Độ dài | Mục đích |
|---|---|---|
| **Product Code** | 8 ký tự | Nhóm cùng loại (cùng nước, vendor, DataType) |
| **SKU Code** | 13 ký tự | Đơn vị sản phẩm — phân biệt dung lượng + số ngày |
| **Item Code / Alias** | 18+ ký tự | Đơn vị bán — gắn với kênh + đối tác |

> Cấu trúc mã Item/Alias: [[products/Item-Code-Structure]]
