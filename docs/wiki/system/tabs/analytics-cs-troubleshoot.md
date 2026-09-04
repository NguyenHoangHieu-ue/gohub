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
