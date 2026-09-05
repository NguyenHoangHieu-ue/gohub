---
title: "GoHub Wiki — Trang Chủ"
page_type: reference
department: all
tags: [index, moc, home]
aliases: ["Wiki Home", "Index"]
created: 2026-06-13
updated: 2026-09-04
status: active
---

# GoHub Wiki

Kho tri thức nội bộ, chia làm hai khu vực theo đối tượng đọc.

> Tìm kiếm nhanh: dùng tab **Tìm kiếm** trên web hoặc `Ctrl+O` trong Obsidian.

---

## 📖 business/ — Kiến thức sản phẩm & vendor (đọc như bài viết, cho CS/Sale/Product)

- [[business/gioi-thieu-gohub|GoHub Overview]] — Pháp nhân, mô hình kinh doanh, kênh bán hàng
- [[business/thuat-ngu-kinh-doanh|Thuật Ngữ Chỉ Số Kinh Doanh]] — Revenue/GP/GPM%/CM1/CM1%/3HK Contribution %
- [[business/vendor-worldmove|WorldMove (WM)]] — Vendor chính, 8921 sản phẩm, APN data
- [[business/vendor-3hk|3HK]] — Zone-based pricing, 45 zones, dùng cho đa số nước
- [[business/ma-sku|Cấu Trúc Mã SKU (13 ký tự)]] — Giải mã từng vị trí
- [[business/ma-item-alias|Cấu Trúc Mã Item & Alias (18 ký tự)]] — Channel, partner, pricelist
- [[business/loai-data-policy|Data Policy Codes]] — Các mã A/B/C/D.../Z
- [[business/combo-chuan|Combo Chuẩn GoHub]] — 42 combo/country (Daily/Fix/Unlimited)
- [[business/ty-gia|Tỷ Giá Nội Bộ]] — USD/VND, HKD/USD, TWD/USD
- [[business/cong-thuc-gia-3hk|Công Thức Giá Nhập 3HK]] — Fixed×55%, Daily×40%, Unlimited
- [[business/goi-fup-tuy-chinh-3hk|Gói FUP Tùy Chỉnh 3HK]] — Tính giá khi cap và throttle khác 500MB/10-5Mbps
- [[business/chon-vendor|Chọn Vendor Nào?]] — WM vs 3HK vs KDDI theo nước
- [[business/quy-trinh-import-ncc|Quy Trình Import NCC]] — Upload → Diff → Confirm

---

## 🛠 system/ — Kiến trúc & vận hành kỹ thuật (dành cho dev, admin-only)

- [[system/kien-truc-he-thong|Kiến Trúc Hệ Thống]] — 6 Mermaid diagram: Big Picture · AI Pipeline · NCC Import · KB/Wiki · 6 Agents + Guardian · 7 Phases Roadmap
- [[system/chatbot-agents-guardian|Chatbot Agents & Guardian]] — 7 agent + cổng kiểm soát quyền hạn câu hỏi
- [[system/operations-runbook|Operations Runbook]] — Auth, cron, DB, security, incident response
- [[system/quy-trinh-van-hanh|Quy Trình Vận Hành Chuẩn]] — Branching, CI/CD, DB migration, staging-first
- [[system/analytics-data-model|Analytics — Mô Hình Dữ Liệu Chung]] — Đọc TRƯỚC mọi tab analytics khác

### system/tabs/ — Hướng dẫn từng tab web (mục đích · luồng dữ liệu · API · công thức · gotchas)

**Phân tích & báo cáo (BI)**
- [[system/tabs/analytics-dashboard|BI Dashboard]] · [[system/tabs/analytics-bod|BOD Report]] · [[system/tabs/analytics-quarterly|Quarter Report]] · [[system/tabs/analytics-all-time|All-Time Report]]
- [[system/tabs/analytics-channels|Channel Performance]] · [[system/tabs/analytics-b2b|B2B]] · [[system/tabs/analytics-b2c|B2C]] · [[system/tabs/analytics-website|Website Analytics]]
- [[system/tabs/analytics-staff|Staff Performance]] · [[system/tabs/analytics-customers|Customer Performance]] · [[system/tabs/analytics-vendors|Vendor Performance]]
- [[system/tabs/analytics-orders|Orders]] · [[system/tabs/analytics-fulfillment|Inventory]]
- [[system/tabs/analytics-products|Products BI]] · [[system/tabs/analytics-3hk-usage|3HK Data Usage]]
- [[system/tabs/analytics-cs-troubleshoot|CS Troubleshoot Hub]] · [[system/tabs/analytics-targets|KPI Target Planning]]
- [[system/tabs/analytics-my-metrics|My Metrics (OKR Hiếu)]]

**Công cụ hệ thống & admin**
- [[system/tabs/analytics-management|Management BI]] · [[system/tabs/analytics-scheduled|Scheduled Messages]] · [[system/tabs/analytics-devtools|API & Database (SQL Query gộp vào đây, s190)]]
- [[system/tabs/admin-product|Admin Product]] · [[system/tabs/analytics-to-gau|Tổ Gấu]] · [[system/tabs/analytics-creator|Creator Settings]] · [[system/tabs/analytics-creator-ai|Gấu Pro]]

**Sản phẩm, danh mục & tri thức**
- [[system/tabs/skus|System SKUs]] · [[system/tabs/ncc|NCC Catalog]] · [[system/tabs/countries|Reference Countries]] · [[system/tabs/promotions|Promotions]]
- [[system/tabs/chatbot|GoHub AI Chatbot]]

---

## Ghi chú sử dụng

- Tất cả file dùng YAML frontmatter — query bằng **Dataview** trong Obsidian.
- Wikilinks `[[tên file]]` — click để navigate. Link giữa `business/` và `system/` dùng đường dẫn tương đối
  (`../business/...` từ trong `system/`, hoặc ngược lại).
- File trong `business/` viết dạng bài đọc liền mạch, không dùng bảng — phục vụ CS/Sale/Product tra cứu
  nhanh. File trong `system/` giữ bảng/SQL/code nguyên trạng — phục vụ dev/admin.
