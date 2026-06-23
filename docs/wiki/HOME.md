---
title: "GoHub Wiki — Trang Chủ"
page_type: reference
department: all
tags: [index, moc, home]
aliases: ["Wiki Home", "Index"]
created: 2026-06-13
updated: 2026-06-23
status: active
---

# GoHub Wiki

Kho tri thức nội bộ — tài liệu về sản phẩm, vendor, quy trình và hệ thống GoHub.

> Tìm kiếm nhanh: dùng tab **Tìm kiếm** trên web hoặc `Ctrl+O` trong Obsidian.

---

## Công Ty

- [[company/GoHub-Overview|GoHub Overview]] — Pháp nhân, mô hình kinh doanh, kênh bán hàng
- [[company/Business-Metrics-Glossary|Thuật Ngữ Chỉ Số Kinh Doanh]] — Revenue/GP/GPM%/CM1/CM1%/3HK Contribution % (CM1 thay GP2/GPM2)

---

## Nhà Cung Cấp (Vendors)

- [[vendors/WM-WorldMove|WorldMove (WM)]] — Vendor chính, 8921 sản phẩm, APN data
- [[vendors/3HK|3HK]] — Zone-based pricing, 45 zones, dùng cho đa số nước

---

## Sản Phẩm & Mã Hóa

- [[products/SKU-Code-Structure|Cấu Trúc Mã SKU (13 ký tự)]] — Giải mã từng vị trí
- [[products/Item-Code-Structure|Cấu Trúc Mã Item & Alias (18 ký tự)]] — Channel, partner, pricelist
- [[products/Data-Policy-Codes|Data Policy Codes]] — Các mã A/B/C/D.../Z
- [[products/Combo-Chuan-GoHub|Combo Chuẩn GoHub]] — 42 combo/country (Daily/Fix/Unlimited)

---

## Giá & Tỷ Giá

- [[pricing/FX-Rates|Tỷ Giá Nội Bộ]] — USD/VND, HKD/USD, TWD/USD (T06/2026)
- [[pricing/3HK-COGS-Formula|Công Thức Giá Nhập 3HK]] — Fixed×55%, Daily×40%, Unlimited
- [[pricing/3HK-Custom-Package-Pricing|Gói Tùy Chỉnh 3HK]] — Tính giá khi cap và throttle khác 500MB/10-5Mbps
- [[pricing/Vendor-Priority|Quy Tắc Chọn Vendor]] — WM vs 3HK vs KDDI theo nước

---

## Quy Trình

- [[processes/Import-NCC|Import NCC — Upload → Diff → Confirm]] — Quy trình cập nhật giá vendor

---

## Kiến Trúc & Diagram

- [[system/Second-Brain-Architecture|Second Brain — Flow Diagrams]] — 6 Mermaid diagrams: Big Picture · AI Pipeline · NCC Import · KB/Wiki · 6 Agents + Guardian · 7 Phases Roadmap
- [[system/Chatbot-Agents-Guardian|Chatbot Agents & Guardian]] — 6 agent (tư vấn/tra cứu/giải đáp/NCC&gap/template/BI) + cổng kiểm soát quyền hạn câu hỏi

---

## Ghi Chú Sử Dụng

- Tất cả file dùng YAML frontmatter — query bằng **Dataview** trong Obsidian
- Wikilinks `[[tên file]]` — click để navigate
- Tags `#vendor`, `#sku`, `#pricing` để filter nhanh

### Dataview — Xem toàn bộ tài liệu

```dataview
TABLE page_type, department, updated
FROM "docs/wiki"
WHERE status = "active"
SORT page_type ASC
```
