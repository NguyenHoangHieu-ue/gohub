---
title: "Channel Performance (Hiệu Suất Kênh Bán Hàng)"
page_type: tab_guide
department: all
tags: [tab, analytics, channels]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# Channel Performance (Hiệu Suất Kênh Bán Hàng)

Phân tích hiệu quả doanh số & dòng tiền theo từng kênh bán (web, sàn TMĐT, đại lý...), có khấu trừ phí sàn riêng từng kênh.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: so sánh kênh nào đem lại doanh thu/lợi nhuận tốt nhất sau khi trừ phí sàn → quyết định đẩy mạnh hay cắt kênh.
- **Tại sao cần phí sàn riêng**: mỗi sàn thu phí khác nhau (Shopee ~8%, Klook ~12%) → nếu không trừ sẽ đánh giá sai lợi nhuận kênh.

## 2. Đường dẫn & file
- **Web**: `/analytics/channels` — `web/src/app/(dashboard)/analytics/channels/page.tsx`
- **API**: `/api/analytics/channels/{kpis, performance, trend}` + `/api/analytics/channels-with-platform-fee`

## 3. Nguồn dữ liệu & cấu hình phí sàn
- **Doanh thu kênh**: `gohub_dw` (fact revenue) nhóm theo kênh.
- **Phí sàn (Platform Fee)**: tỷ lệ riêng từng kênh, cấu hình + áp tại `channels-with-platform-fee`. Doanh thu kênh trừ phí sàn trước khi vào công thức margin/CM1 chung.

## 4. Công thức & nghiệp vụ
- Doanh thu thuần kênh = doanh thu − phí sàn.
- Margin/**CM1** kênh = doanh thu thuần − COGS − chi phí kênh (term CM1, xem `analytics-bod`).
- **Trend**: chuỗi theo tháng để thấy xu hướng từng kênh.

## 5. Vấn đề đã gặp & cách khắc phục
- **Không cache (S81)**: `channels/{kpis,performance,trend}` trước gọi thẳng DB → chậm. Fix: `cachedQuery` 12h + prewarm.
- **Đổi term CM1 (S74)**: label margin GP2→CM1, giữ key data.

## 6. Phân quyền
- Xem: **Admin, Creator, Manager, BOD, Staff**.
- Staff: cấp theo phòng ban/per-user qua `allowed_analytics` (deny-by-default).
