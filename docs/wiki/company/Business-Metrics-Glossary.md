---
title: "Thuật Ngữ Chỉ Số Kinh Doanh (Business Metrics)"
page_type: reference
department: finance
tags: [metrics, cm1, gpm, revenue, 3hk, management-report, glossary]
aliases: ["CM1", "Contribution Margin 1", "GPM", "3HK Contribution", "Business Metrics", "Management Report Terms"]
created: 2026-06-23
updated: 2026-06-23
status: active
---

# Thuật Ngữ Chỉ Số Kinh Doanh

> Cập nhật 23/06/2026: thống nhất cách gọi với **Management Report**.
> **GP2 / GPM2 (cách gọi cũ) → CM1 / CM1% (cách gọi mới).**

---

## Các Chỉ Số Cốt Lõi

| Thuật ngữ | Định nghĩa | Công thức |
|---|---|---|
| **Revenue** | Doanh thu | — |
| **Gross Profit (GP)** | Lợi nhuận gộp | Revenue − COGS |
| **Gross Profit Margin (GPM%)** | Tỷ suất lợi nhuận gộp | Gross Profit / Revenue × 100% |
| **Contribution Margin 1 (CM1)** | Lợi nhuận đóng góp bậc 1 | Gross Profit − Operation Cost |
| **CM1%** | Tỷ suất CM1 | CM1 / Revenue × 100% |
| **3HK Contribution Revenue %** | Tỷ trọng doanh thu từ sản phẩm 3HK | Revenue from 3HK Products / Total Revenue × 100% |

- **COGS** = chi phí của sản phẩm (giá nhập).
- **Operation Cost** = phí vận hành: phí sàn / phí quảng cáo / phí tài trợ sản phẩm (sponsor) / media...

---

## Đổi Tên Thuật Ngữ (23/06/2026)

| Cách gọi cũ | Cách gọi mới |
|---|---|
| Gross Profit 2 (GP2) | **Contribution Margin 1 (CM1)** |
| Gross Profit Margin 2 (GPM2) | **% Contribution Margin (CM1%)** |

> Lưu ý: **GPM% (Gross Profit Margin) GIỮ NGUYÊN** — không đổi. Chỉ GP2/GPM2 đổi thành CM1/CM1%.

---

## 2 Key Metrics Chính Của Team Business

1. **CM1** (Contribution Margin 1) — lợi nhuận sau khi trừ cả COGS lẫn chi phí vận hành.
2. **3HK Contribution Revenue %** — tỷ trọng doanh thu đến từ sản phẩm 3HK (vendor `3HKDATAPOOL`).

---

## Trên Web (Analytics)

- Toàn bộ trang analytics đã đổi nhãn hiển thị **GP2/GPM2 → CM1 / CM1%** (Channels, BOD, B2B, B2C, All-Time, Targets).
- **3HK Contribution %** hiển thị dạng KPI trên trang **BOD (Board of Directors Report)**.
- Nhận diện "sản phẩm 3HK" trong dữ liệu: `dim_sku.vendor ILIKE '3HKDATAPOOL'`.

> Liên quan: [[company/GoHub-Overview|GoHub Overview]] · [[vendors/3HK|3HK]]
