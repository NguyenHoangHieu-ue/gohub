---
title: "Vendor 3HK — Hướng Dẫn Tư Vấn"
audience: cs-product
visibility: all
page_type: vendor_profile
department: cs-sale
tags: [vendor, 3hk, zone, tu-van, sim, esim, data-pool]
aliases: ["3HK", "3 Hong Kong", "3HK Datapool"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-13
updated: 2026-08-22
status: active
---

# Vendor 3HK — Hướng Dẫn Tư Vấn

> **TL;DR — Đọc nhanh:** 3HK là vendor data quốc tế, GoHub mua theo GB và tạo gói bán lại. Dùng khi nước KH hỏi không có WM hoặc WM kém cạnh tranh. CS không cần tra 3HK nếu GoHub đã có SKU — chỉ bán SKU sẵn có.

---

## Khi Nào CS Cần Biết Đến 3HK?

| Tình huống | CS làm gì |
|---|---|
| KH hỏi nước **đã có SKU GoHub** | Bán SKU bình thường — không cần tra 3HK |
| KH hỏi nước **chưa có SKU** | Kiểm tra 3HK có vùng đó không → báo team Product tạo thêm |
| KH hỏi "dùng mạng gì ở nước X?" | Tra tab **NCC → 3HK** → xem vùng tương ứng |
| Team Product tạo gói mới | Dùng giá 3HK + công thức tính COGS → tạo SKU |

---

## Vùng Phủ Sóng & Giá (Tra Nhanh)

| Khu vực | Các nước tiêu biểu | Giá/GB |
|---|---|---|
| **Châu Á — Tier 1** | Nhật, Hàn, Singapore, Thái, Malaysia, HK, Đài Loan, Indonesia, Philippines, Việt Nam, Cambodia, Lào | **5 HKD/GB** |
| **Châu Âu + Mỹ** | Anh, Đức, Pháp, Ý, Tây Ban Nha, USA, Canada | **7 HKD/GB** |
| **Úc + New Zealand** | AU, NZ | **6.5 HKD/GB** |

> Tỷ giá HKD → VND: xem [[pricing/FX-Rates]] hoặc tab **Cài đặt → Tỷ giá**

**Tổng cộng: 45 vùng địa lý.** Tra đầy đủ tại tab **NCC Catalog → 3HK**.

---

## Các Loại Gói GoHub Tạo Từ 3HK

| Loại gói | Data hoạt động như thế nào | Tốt cho KH nào |
|---|---|---|
| **Fixed Data** | Tổng cố định (3/5/10/20GB), hết thì hết | KH biết rõ nhu cầu, đi ngắn ngày |
| **Daily Data** | Cấp mỗi ngày (1GB/ngày), reset lúc nửa đêm | KH muốn dùng đều, không lo bùng data |
| **Unlimited 10 Mbps** | Dùng thoải mái, sau 1.8GB/ngày giảm về 10 Mbps | Du lịch dài ngày, cần stream / map |
| **Unlimited 5 Mbps** | Dùng thoải mái, sau 1.6GB/ngày giảm về 5 Mbps | Ngân sách hạn chế, dùng chat / browse nhẹ |

---

## Script Tư Vấn KH (Copy-Paste)

**KH hỏi: "Đi [nước] thì dùng SIM nào?"**
> "Dạ bên em có gói eSIM/SIM cho [nước] từ mạng 3HK, phủ sóng tốt, không cần đăng ký giấy tờ. Anh/chị dùng khoảng [số ngày] ngày, nhu cầu data [nhiều/ít]? Em có thể tư vấn gói phù hợp nhất."

**KH hỏi về tốc độ:**
> "Gói Unlimited có tốc độ cao không giới hạn trong ngày, sau [1.8/1.6]GB sẽ giảm về [10/5] Mbps — vẫn dùng được thoải mái cho chat, map, browse."

**KH lo về vùng phủ sóng:**
> "3HK dùng hạ tầng [nhà mạng địa phương] tại [nước], phủ sóng [4G/5G]."

---

## Lưu Ý Quan Trọng Khi Tư Vấn

- ✅ Không cần KYC cho đa số các vùng — **lợi thế lớn** khi tư vấn
- ✅ GoHub đã tạo sẵn các combo chuẩn — CS chỉ cần chọn SKU đúng
- ⚠️ **Không bán "gói 3HK"** — bán SKU GoHub đã build từ 3HK
- ⚠️ Nếu KH hỏi nước chưa có SKU → không báo "không có" ngay; kiểm tra team Product trước
- ℹ️ COGS 3HK được tính theo hệ số (không phải giá trọn gói) — không tiết lộ giá nhập

---

## Thông Tin Kỹ Thuật (Cho Team Product)

**Mã vendor trong SKU:** `3D` (vị trí 6–7)

**Công thức COGS (tóm tắt):**

| Loại gói | Hệ số tính GB thực | Ví dụ (zone châu Á, 5 HKD/GB) |
|---|---|---|
| Fixed Data | GB gói × **0.55** | 5GB → 5×0.55×5 = 13.75 HKD |
| Daily Data | GB/ngày × ngày × **0.40** | 1GB×7ngày → 7×0.4×5 = 14 HKD |
| Unlimited 10 Mbps | **1.8** GB/ngày × ngày | 7 ngày → 1.8×7×5 = 63 HKD |
| Unlimited 5 Mbps | **1.6** GB/ngày × ngày | 7 ngày → 1.6×7×5 = 56 HKD |

> Chi tiết công thức: [[pricing/3HK-COGS-Formula]]

---

## Xem Thêm

- [[pricing/Vendor-Priority|Khi nào chọn 3HK vs WM?]]
- [[pricing/FX-Rates|Tỷ giá HKD/USD/VND]]
- [[products/SKU-Code-Structure|Cách đọc mã SKU]]
- [[products/Combo-Chuan-GoHub|42 combo chuẩn GoHub]]
