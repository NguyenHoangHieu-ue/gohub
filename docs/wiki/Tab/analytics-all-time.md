---
title: "All-Time Report (Báo Cáo Hiệu Suất Lịch Sử)"
page_type: tab_guide
department: all
tags: [tab, analytics, report]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# All-Time Report (Báo Cáo Hiệu Suất Lịch Sử)

Phân tích hiệu suất đa năm/đa kỳ, so sánh tăng trưởng kỳ này vs kỳ trước theo 3 trục kênh lớn.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: nhìn bức tranh dài hạn (nhiều năm) thay vì 1 tháng — đánh giá xu hướng tăng trưởng tổng thể theo B2B-Strategic / B2B-Non-Strategic / B2C.
- **Tại sao tách riêng**: query trên toàn bộ lịch sử rất nặng → cần cơ chế chạy có kiểm soát (nút Áp dụng) khác các tab realtime.

## 2. Đường dẫn & file
- **Web**: `/analytics/all-time` — `web/src/app/(dashboard)/analytics/all-time/page.tsx`
- **API**: `/api/analytics/all-time-performance`

## 3. Nguồn dữ liệu & nghiệp vụ
- **Nguồn**: `gohub_dw` (toàn bộ lịch sử fact revenue).
- **Phân nhóm 3 trục**: B2B-Strategic / B2B-Non-Strategic / B2C (dùng Partner Tiers + dedup như B2B).
- **So sánh kỳ**: kỳ chọn vs kỳ trước để tính tăng trưởng.

## 4. Kỹ thuật & lưu ý
- **Bộ lọc ngày dùng nút "Áp dụng" thủ công**: tránh gửi liên tục query nặng về kho lịch sử khi gõ ngày.
- **Chuẩn hoá casing**: nhãn `"Non-Strategic"` viết hoa chữ S nhất quán với toàn hệ thống (tránh lệch nhóm).

## 5. Phân quyền
- **Admin, Creator, BOD, Manager, Staff**. **Standard** bị chặn.
