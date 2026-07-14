---
title: "B2C Performance (Hiệu Suất Bán Lẻ B2C)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, b2c]
created: 2026-06-28
updated: 2026-07-14
status: active
---

# B2C Performance (Hiệu Suất Bán Lẻ B2C)

Báo cáo bán lẻ B2C bố cục 5 section (Apple-style, giảm tải nhận thức): doanh thu rolling, khách hàng, CAC/Leads, tỷ lệ chuyển đổi website, và chi phí marketing/ROAS. Tích hợp nhiều nguồn ngoài (Chatwoot, GA4, Turso).

---

## 1. Mục đích & vai trò
- **Dùng để làm gì**: đo hiệu quả kênh bán lẻ end-to-end — từ lead → khách mới → doanh thu → chi phí marketing → ROAS — để biết tiền marketing đẻ ra bao nhiêu doanh thu.
- **Tại sao 5 section tách biệt**: mỗi câu hỏi kinh doanh (bán được bao nhiêu? khách ở đâu ra? tốn bao nhiêu để có khách? web chốt tốt không? quảng cáo lời không?) là 1 section riêng → dễ đọc.

## 2. Đường dẫn & file
- **Web**: `/analytics/b2c` — `web/src/app/(dashboard)/analytics/b2c/page.tsx` (+ `components/b2c-advanced-dashboard.tsx`)
- **API**: `/api/analytics/b2c/{monthly, kpis, trend, loss-skus}`

## 3. Cấu trúc 5 section
- **S1 Revenue Rolling**: doanh thu 6 tháng VN/US/Total + tiến độ MTD/MoM/Prorata so KPI.
- **S2 Customers**: khách mới (New) vs quay lại (Returning), có MoM.
- **S3 CAC & Leads**: leads từ Chatwoot → so đơn thực tế (conversion).
- **S4 Website CR**: tỷ lệ mua trên web từ GA4.
- **S5 Marketing Cost & ROAS**: ngân sách vs chi phí thực + ROAS + spend pace.

## 4. Công thức nghiệp vụ
$$\text{CAC} = \frac{\text{Chi phí Marketing thực tế}}{\text{Số khách hàng mới}} \qquad \text{ROAS} = \frac{\text{Doanh thu B2C}}{\text{Chi phí Marketing thực tế}}$$
$$\text{Spend Pace} = \frac{\text{Chi phí thực tế}}{\text{Ngân sách Marketing B2C}} \times 100\% \qquad \text{CR} = \frac{\text{Khách mua thực tế}}{\text{Tổng Leads}} \times 100\%$$

## 5. Nguồn dữ liệu chi tiết (lấy gì, từ đâu, tại sao)
- **Doanh thu/khách**: `gohub_dw` (fact revenue, lọc kênh B2C theo prefix item_type cấu hình).
- **Leads**: **Chatwoot** qua `lib/chatwoot.ts` (account CS 87064), đếm hội thoại theo Inbox (Web, Facebook, Zalo, WhatsApp, Tiktok Shop). **Tại sao Chatwoot**: leads B2C đổ về CS, không nằm trong kho ETL.
- **Website CR**: **GA4** — config 2 property lưu `app_config['ga4_configs']` (Turso, đã copy sang Supabase).
- **Marketing Spend**: `channel_group_costs` (Turso) — nhập tay.
- **KPI target & Ngân sách**: `b2c_kpi_targets` + `b2c_budget` (`app_settings`) — **(S82) cấu hình các giá trị này nay nằm ở trang KPI/Target `/analytics/targets`** (trước đặt nhầm trong Admin). B2C chỉ đọc để hiển thị/tính spend pace.

## 6. Vấn đề đã gặp & cách khắc phục
- **Spend/leads thiếu nguồn (S67-70)**: GA4 2 property + leads ở omni riêng → thiết kế đọc đa nguồn (Chatwoot/GA4/Turso) thay vì chỉ gohub_dw.
- **Không cache (S81)**: `b2c/{kpis,performance,trend,loss-skus}` trước gọi thẳng DB → chậm. Fix: `cachedQuery` 12h.
- **Đổi term CM1 (S74)**: label margin đổi GP2→CM1, giữ key `gpm2`.
- **Cấu hình đặt sai chỗ (S82)**: "KPI Target B2C" + "Ngân sách Marketing B2C" trước nằm trong Admin → chuyển về KPI/Target cho đúng ngữ cảnh.

## 7. Phân quyền
- Xem: **Admin, Creator, Manager, BOD, Staff**.
- **Ẩn methodology + nút sửa ngân sách**: chỉ **Admin/Creator** (sửa giá trị thực hiện ở KPI/Target).
