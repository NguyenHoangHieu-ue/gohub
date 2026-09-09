---
title: "Thuật Ngữ Chỉ Số Kinh Doanh (Business Metrics)"
page_type: reference
department: finance
audience: staff
visibility: all
tags: [metrics, cm1, gpm, revenue, 3hk, management-report, glossary, thuat-ngu]
aliases: ["CM1", "Contribution Margin 1", "GPM", "3HK Contribution", "Business Metrics", "Management Report Terms"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-23
updated: 2026-09-04
status: active
---

# Thuật Ngữ Chỉ Số Kinh Doanh

Từ 23/06/2026, cách gọi các chỉ số kinh doanh đã thống nhất với Management Report: tên gọi cũ "GP2/GPM2"
đã đổi thành "CM1/CM1%".

## Các chỉ số cốt lõi

Revenue là doanh thu. Gross Profit (GP), hay lợi nhuận gộp, bằng Revenue trừ COGS. Gross Profit Margin
(GPM%), tỷ suất lợi nhuận gộp, bằng Gross Profit chia Revenue nhân 100%. Contribution Margin 1 (CM1), lợi
nhuận đóng góp bậc một, bằng Gross Profit trừ Operation Cost. CM1% là CM1 chia Revenue nhân 100%. 3HK
Contribution Revenue % là tỷ trọng doanh thu từ sản phẩm 3HK, tính bằng doanh thu sản phẩm 3HK chia tổng
doanh thu nhân 100%.

COGS là chi phí của sản phẩm, tức giá nhập. Operation Cost là phí vận hành: phí sàn, phí quảng cáo, phí
tài trợ sản phẩm (sponsor), và chi phí media.

## Đổi tên thuật ngữ (23/06/2026)

Tên gọi "Gross Profit 2 (GP2)" đã đổi thành "Contribution Margin 1 (CM1)". Tên gọi "Gross Profit Margin 2
(GPM2)" đã đổi thành "% Contribution Margin (CM1%)". Lưu ý GPM% (Gross Profit Margin, không có số 2) giữ
nguyên không đổi — chỉ riêng GP2/GPM2 đổi tên thành CM1/CM1%.

## Hai chỉ số chính của team Business

CM1 (Contribution Margin 1) là lợi nhuận sau khi trừ cả COGS lẫn chi phí vận hành. 3HK Contribution
Revenue % là tỷ trọng doanh thu đến từ sản phẩm 3HK (vendor `3HKDATAPOOL`).

## Trên web analytics

Toàn bộ trang analytics đã đổi nhãn hiển thị từ GP2/GPM2 sang CM1/CM1% (áp dụng ở các tab Channels, BOD,
B2B, B2C, All-Time, Targets). 3HK Contribution % hiển thị dạng KPI ngay trên trang BOD (Board of Directors
Report). Trong dữ liệu, sản phẩm 3HK được nhận diện qua điều kiện `dim_sku.vendor ILIKE '3HKDATAPOOL'`.

Xem thêm bài [[gioi-thieu-gohub|GoHub Overview]] và [[vendor-3hk|3HK]].
