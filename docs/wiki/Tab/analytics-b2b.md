---
title: "B2B Performance (Hiệu Suất Bán Sỉ B2B)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, b2b]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# B2B Performance (Hiệu Suất Bán Sỉ B2B)

Báo cáo kênh đại lý/bán sỉ: doanh thu, biên lợi nhuận, chi phí kênh và so sánh **đại lý chiến lược (Strategic)** vs **thường (Non-Strategic)**.

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: theo dõi sức khỏe kênh sỉ — ai (tier nào) đang đóng góp doanh thu/margin, chi phí kênh bao nhiêu, xu hướng theo thời gian.
- **Tại sao chia Strategic/Non-Strategic**: 2 nhóm có chính sách giá/chiết khấu khác nhau → phải báo cáo riêng để đánh giá đúng hiệu quả từng nhóm.

## 2. Đường dẫn & file
- **Web**: `/analytics/b2b` — `web/src/app/(dashboard)/analytics/b2b/page.tsx`
- **API**: `/api/analytics/b2b/{kpis, performance, strategic-performance, trend}`

## 3. Nguồn dữ liệu & phân tầng đối tác
- **Doanh thu/đơn**: `gohub_dw` (fact revenue), lọc kênh nhóm B2B.
- **Phân tầng (Partner Tiers)**: danh sách đối tác Strategic cấu hình tại **Settings → Partner Tiers** (`/api/config/partner-tiers`, lưu `app_settings`). **Tại sao cấu hình động**: danh sách đại lý chiến lược thay đổi theo thỏa thuận kinh doanh → không hardcode.
- **Chi phí kênh**: nhập qua `CostManagementModal` (lưu `channel_group_costs` / Turso) — dùng tính margin sau chi phí.

## 4. Quy tắc nghiệp vụ & chống trùng (dedup)
- **Strategic** = đối tác nằm trong tier "Strategic". **Non-Strategic** = phần còn lại.
- **Dedup**: khi tổng hợp báo cáo kênh chung phải tránh tính đôi doanh số đại lý chiến lược → dùng helper SQL `getGroupCaseSQL` + `getFilteredOtherTiers` (CASE phân nhóm + loại trừ tier đã tính).
- **Margin %** = biên lợi nhuận gộp của đại lý (đã đổi term sang **CM1** trên label — xem `analytics-bod`).

## 5. Tính năng vận hành
- **Delta Pill**: badge tăng/giảm tô xanh/đỏ theo dấu thực tế (`autoDeltaKind`) — sửa lỗi bản cũ luôn hiện xanh.
- **Quản lý chi phí kênh sỉ**: `CostManagementModal` lưu chi phí riêng kênh B2B.
- **Export PDF/Screenshot**: `jspdf` + `modern-screenshot`.

## 6. Vấn đề đã gặp & cách khắc phục
- **Giá B2B sai (S78)**: chatbot/báo cáo lẫn giá các kênh (OD/WS/Strategic) → cấu hình **Item Type theo kênh** (prefix) trong Settings để lọc đúng giá kênh.
- **`strategic-performance` không cache (S81)**: trước gọi thẳng `queryAnalytics` → chậm. Fix: bọc `cachedQuery` 12h như các endpoint khác.
- **Badge biến động luôn xanh (bản cũ)**: thay bằng `DeltaPill` + `autoDeltaKind`.

## 7. Phân quyền
- **Admin, Creator, BOD, Manager, Staff** (Staff thường giới hạn theo phòng ban/per-user). **Standard** bị chặn.
