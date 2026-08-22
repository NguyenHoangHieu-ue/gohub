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
updated: 2026-08-22
status: active
---

# Chọn Vendor Nào? — Hướng Dẫn Nhanh

> **TL;DR:** WM trước → nếu không có thì 3HK → Nhật thì KDDI → cuối cùng mới xét BC/JY.

---

## Sơ Đồ Quyết Định (1 Phút)

```
KH hỏi nước nào?
│
├── Nhật Bản → KDDI
│
├── Hong Kong hoặc Đài Loan → WM (không KYC, giá tốt)
│
└── Nước khác:
    ├── GoHub đã có SKU? → Bán SKU đó (không cần tra vendor)
    │
    └── Chưa có SKU:
        ├── WM có gói? → WM
        ├── WM không có → 3HK có vùng? → 3HK
        └── Cả hai không có → BC / JY → Báo team Product tạo mới
```

---

## Bảng Tham Chiếu Nhanh

| Nước / Khu vực | Vendor ưu tiên | Lý do |
|---|---|---|
| **Hong Kong** | WM | Không KYC, giá cạnh tranh, phủ sóng rất tốt |
| **Đài Loan** | WM | Không KYC, phủ sóng tốt |
| **Nhật Bản** | KDDI | Partnership riêng, chất lượng mạng cao nhất |
| **Hàn Quốc** | WM hoặc 3HK | Tùy gói — so sánh giá và data policy |
| **Singapore, Thái, Malaysia...** | WM hoặc 3HK | WM nếu có gói tốt, 3HK nếu không |
| **Châu Âu, Mỹ** | WM hoặc 3HK | WM cho các nước chính, 3HK bổ sung |
| **Nước hiếm / ít phổ biến** | 3HK | Phủ sóng rộng hơn WM cho nước nhỏ |

---

## Khi Có Nhiều Vendor Cùng Có Gói — Chọn Theo Thứ Tự

1. **Giá nhập thấp hơn** → ưu tiên (biên lợi nhuận cao hơn)
2. **Gói đặc thù nước > Gói khu vực > Gói toàn cầu** — gói càng cụ thể, chất lượng càng tốt
3. **Không cần KYC** → ưu tiên nếu giá tương đương (khách dễ mua hơn)

---

## Phân Biệt 3 Trường Hợp "Không Có"

| Tình huống | Diễn đạt đúng với KH | Hành động |
|---|---|---|
| GoHub chưa tạo SKU nhưng vendor có gói | "Hiện bên em chưa có sản phẩm cụ thể cho nhu cầu này, em sẽ hỗ trợ tìm thêm" | Báo team Product tạo SKU |
| Vendor không có gói cho nước đó | "WM chưa có, em kiểm tra thêm nhà cung cấp khác" | Chuyển sang 3HK / BC |
| Cả WM và 3HK đều không có | "GoHub hiện chưa có dịch vụ cho nước này" | Ghi nhận nhu cầu, báo BD |

> ⚠️ Không nói "hết hàng" hay "vendor không có" nếu thực ra là GoHub chưa tạo SKU — đây là 2 việc khác nhau.

---

## Trạng Thái Từng Vendor

| Vendor | Mã SKU | Trạng thái | Số gói |
|---|---|---|---|
| **WorldMove (WM)** | `GB` | ✅ Đang hoạt động đầy đủ | 8.921 gói |
| **3HK Datapool** | `3D` | ✅ Đang hoạt động đầy đủ | 45 vùng giá |
| **KDDI** | `KD` | ✅ Nhật Bản (partnership) | Giới hạn |
| BillionConnect (BC) | `BC` | ⏳ Chưa triển khai đầy đủ | — |
| SimStore (SS) | `SS` | ⏳ Chưa triển khai | — |
| TruemoveH (TM) | `TM` | ⏳ Chưa triển khai | — |
| Viettel (VT) | `VT` | ⏳ Chưa triển khai | — |

---

## Xem Thêm

- [[vendors/WM-WorldMove|Chi tiết vendor WM]]
- [[vendors/3HK|Chi tiết vendor 3HK]]
- [[products/Combo-Chuan-GoHub|42 combo chuẩn GoHub theo nước]]
- [[pricing/3HK-COGS-Formula|Tính giá 3HK]]
