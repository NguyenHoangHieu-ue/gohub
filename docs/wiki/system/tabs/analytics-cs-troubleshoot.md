---
title: "CS Troubleshoot Hub (Trung Tâm Khắc Phục Sự Cố CS)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, analytics, cs, tickets]
created: 2026-06-28
updated: 2026-07-15
status: active
---

# CS Troubleshoot Hub (Trung Tâm Khắc Phục Sự Cố CS)

Tra cứu & phân tích ticket chăm sóc khách hàng (Lark) để tìm nhanh cách xử lý sự cố tương tự.

---

## 1. Đường dẫn & File
| | |
|---|---|
| Web | `/analytics/cs-troubleshoot` — `web/src/app/(dashboard)/analytics/cs-troubleshoot/page.tsx` |
| API | `/api/reports/cs-troubleshoot` |
| Nguồn | **Supabase `lark_cs_tickets`** (24.712 ticket, migrate từ Turso) |
| Sync | `/api/admin/sync-lark-tickets` (Lark Base API) — cron 02:00 UTC |

## 2. Nội dung
- Tìm kiếm ticket theo nội dung/loại/trạng thái; xem cách xử lý đã ghi nhận.
- Data ban đầu migrate 24.712 ticket từ Turso (`scripts/migrate_turso_tickets.py`), sau đó sync bổ sung qua Lark Base API.

## 3. Gotchas
- **🔴 Fix s198 (2026-09-15) — Sync Lark timeout 60s, data đứng yên 15 ngày ("không cập nhật realtime")**:
  Hiếu báo tab không cập nhật realtime. Kiến trúc trang này vốn KHÔNG realtime (poll/batch — cron
  `sync-lark-tickets` 1 lần/ngày 09:00 ICT + nút "Sync Lark" bấm tay), nhưng verify qua Vercel Runtime
  Logs phát hiện bug thật NẶNG HƠN nhiều: `Vercel Runtime Timeout Error: Task timed out after 60 seconds`
  trên **MỌI lần chạy** (cả cron lẫn bấm tay) — bảng `lark_cs_tickets` đã lên ~30.000 ticket, phân trang
  qua Lark Base API (500 record/trang, ~60 trang) vượt quá `maxDuration=60` cấu hình cũ → Vercel giết
  function giữa chừng, sync KHÔNG BAO GIỜ hoàn thành → `lastSync` đứng yên từ **2026-08-31** suốt 15 ngày
  (không phải "chậm 1 ngày" như kiến trúc batch thường thấy — mà HOÀN TOÀN ĐỨNG YÊN vì chưa lần nào chạy
  xong kể từ khi bảng đủ lớn). Cùng lớp bug đã gặp ở Bé Gấu (s195+14). Fix: nâng `maxDuration` 60→300
  (Hobby + Fluid Compute cho phép, không cần nâng gói) ở CẢ `route.ts` (`export const maxDuration`) lẫn
  `vercel.json` (functions map) — thiếu 1 chỗ không đủ. Thêm log tiến độ mỗi trang (trước hoàn toàn không
  có log nào, phải mò qua Runtime Logs mới phát hiện được). **Đã tự QA live trên staging** — bấm Sync Lark
  sau deploy: chạy xong thật, không còn 504, tăng từ 29.748 → 31.248 ticket (~1.500 ticket mới), banner
  hiện đúng thời gian sync vừa xong.
- **🔴 Fix s197 (2026-09-14) — "Units Sold by Source" thiếu filter `channelGroup`** (phát hiện qua audit
  toàn hệ thống logic dữ liệu): query `sourceRows` (`api/reports/cs-troubleshoot/route.ts`) thiếu
  `${groupFilter}` mà 3 query anh em cùng khối (`totalRows`/`skuRows`/`vendorRows`) đều có → khi lọc
  B2B/B2C, tử số (TBS tickets) bị lọc nhưng mẫu số (unitsSold theo Source) KHÔNG lọc → TBS Rate theo
  Source bị kê thấp giả tạo. Không lệch khi filter="All" (chỉ hiện khi chọn B2B hoặc B2C).
- **s196+21 (2026-09-14) — thêm nút Export cho sub-tab "SKU & Telco Performance"**: trước tab này KHÔNG
  có nút export nào dù có bảng dữ liệu (finding #7, đề xuất H P2 roadmap UI/UX audit s196+20). Xuất TOÀN
  BỘ `sorted` (không chỉ 15 dòng hiển thị) qua `exportRawRows`. 4 sub-tab còn lại (TBS Overview/Vendor/
  Source/Invalid Tickets) CHƯA có export — chỉ làm sub-tab dữ liệu SKU-level nặng nhất trước.
- **s194+11 (2026-09-06)**: fix hex navy SAI `#003B95`/`#002B70` (audit s192 từng flag, 16 chỗ)→`brand-*`;
  4 KPI card viết tay → `StatTile`; chart TBS Volume by Shift → `CHART_PALETTE`/`CHART_GRID_COLOR`/
  `chartTooltipStyle`. Không đổi logic/data.
- Đây là nguồn **Supabase**, không phải gohub_dw.
- Cron sync cần `CRON_SECRET`.

---

## Data Sources

| Column / Metric | Source Table | Formula / Note |
|-----------------|-------------|----------------|
| Ticket list | Supabase `lark_cs_tickets` | 24.712 ticket, migrate từ Turso (`scripts/migrate_turso_tickets.py`) |
| Ticket search | Supabase `lark_cs_tickets` | Full-text search theo nội dung / loại / trạng thái |
| Sync source | Lark Base API | Cron `/api/admin/sync-lark-tickets` chạy 02:00 UTC |
| Handler | `lark_cs_tickets.handler` | Field "Ticket Handler" từ Lark Base (page_size=500) |
