# GoHub — Trạng Thái Hệ Thống & Roadmap

**Cập nhật lần cuối:** 2026-06-21 (session 71 — phân quyền Role×Report + QA analytics + E2E 6 agent)

---

## Tổng Quan Hệ Thống

GoHub PM là nền tảng **all-in-one** cho team GoHub, hợp nhất:
1. **Product Management** — quản lý catalog SIM/eSIM, NCC, KB
2. **Business Intelligence** — analytics từ gohub_dw (doanh thu, orders, staff, customers)
3. **AI Assistant** — chatbot 6 agents + BI analyst + Lark bot (dùng chung router)

---

## ✅ Đã Hoàn Thành

### Merge gohub-intel → GoHub PM (Phase 1–5)

| Phase | Mô tả | Commit |
|---|---|---|
| Phase 1 | Unified Shell — pg client, roles, sidebar | 3c39349 |
| Phase 2 | Core Analytics — 20 APIs + 5 trang | bcf51ec |
| Phase 3 | BI Agent — bi-analyst + SQL + chart | ec1cd47 |
| Phase 4 | Operations — Orders, Staff, Fulfillment, Customers, Products, Vendors, CS, 3HK, Targets | 7e72b5c |
| Phase 5 | Config & Admin — SQL Explorer, Scheduled Messages, Partner Tiers | 59ddef3 |

### Supabase Migrations đã chạy
Tất cả `v1` → `v17` đã chạy. Migrations hiện tại:
- `v13` analytics tables (gồm `analytics_target_planning`, `analytics_channel_*costs`)
- `v14` lark_cs_tickets, `v15` lark_scheduled_messages
- `v16` allowed_analytics + `v17` allowed_tabs (per-user permissions)
- **Phân quyền Role×Report (session 71): KHÔNG cần migration** — lưu trong `app_settings.role_permissions` (JSON Role→[analyticsId]).

### Data đã migrate
- **24,712 lark_tickets** từ Turso → Supabase `lark_cs_tickets` (script: `scripts/migrate_turso_tickets.py`)

---

## ✅ Product & Catalog

| Tính năng | Status |
|---|---|
| SP Hệ Thống (Products/SKUs/Listings/Items) | ✅ Production |
| SP Vendor WM (8,921 sản phẩm, APN đầy đủ) | ✅ Production |
| SP Vendor 3HK (45 zones) | ✅ Production |
| NCC Standard Format (template import) | ✅ Production |
| Template tạo sản phẩm (WM + 3HK, eSIM + SIM) | ✅ Production |
| Gap analysis NCC | ✅ Production |
| Export XLSX | ✅ Production |

---

## ✅ AI Agent System (6 Agents) — E2E tested session 71

| Agent | Model | Chức năng |
|---|---|---|
| `tu-van` | gemini-3.5-flash | Tư vấn SIM/eSIM theo nước/ngày/GB |
| `tra-cuu` | gemini-3.5-flash | Tra cứu SKU/Product/COGS/FX |
| `giai-dap` | gemini-3.5-flash | Giải thích thuật ngữ, cấu trúc mã, mã nhóm nước, KB/wiki |
| `gap-analysis` | gemini-3.5-flash | Catalog NCC (browse) + so sánh NCC vs GoHub system |
| `bi-analyst` | gemini-3.5-flash | Query gohub_dw → trả lời + biểu đồ (function calling) |
| `tao-template` | gemini-3.5-flash | Xuất template Excel từ catalog NCC (admin/manager) |

**Router (dùng chung web + Lark):** Gemini classifier + regex fallback + override xác định
(BI/template/explain) + so khớp nước theo ranh giới từ (xử lý homograph "nhất"≠"Nhật").
**Lark Bot:** Bé Gấu Thông Thái (p2p + group + thread mention) — dùng chung router/context/bi-analyst.
**Web Chatbot:** `/chatbot` — stream response, agent badge, BI chart rendering.
**E2E test (session 71):** 6/6 agent PASS với Gemini + Supabase/gohub_dw thật; fix 5 bug routing.

---

## ✅ Business Intelligence (Analytics)

| Page | Data Source |
|---|---|
| Dashboard, BOD Report | gohub_dw |
| All-Time Report | gohub_dw (B2B-Strat/Non-Strat/B2C) |
| B2B, B2C, Channel Performance | gohub_dw |
| Orders Management | gohub_dw |
| Staff Performance | gohub_dw |
| Customer Performance (B2B) | gohub_dw |
| Vendor Performance | gohub_dw |
| Product Performance (SKU) | gohub_dw |
| Fulfillment Report | gohub_dw |
| CS Troubleshoot Hub | gohub_dw + Supabase (24,712 tickets) |
| 3HK Data Usage | gohub_dw (fact_data_usage) |
| Target Planning | gohub_dw + Supabase |
| SQL Explorer | gohub_dw (admin only, SELECT-only) |

---

## ✅ Second Brain (KB + Wiki)

| Phase | Status |
|---|---|
| Phase 1 — KB Upload (PDF/DOCX → chunk → embed) | ✅ Done |
| Phase 2 — Wiki nội bộ (Markdown + version history) | ✅ Done |
| Phase 3 — MRP Smart Ingestion (upload → AI plan → approve) | ✅ Done |
| Phase 4 — MCP Server (9 tools) | ✅ Done |
| Phase 5 — NCC Standard Format + Import UI | ✅ Done |
| Phase 6 — Notifications (sync alert, web bell, Lark) | ✅ Done |
| Phase 7 — RBAC nâng cao (dept × tab matrix) | ✅ Done |

---

## ✅ Admin & Operations

| Tính năng | Status |
|---|---|
| User management (CRUD, roles, departments) | ✅ Done |
| Permission matrix (role × feature, dept × tab) | ✅ Done |
| **Phân quyền Analytics Role×Report (bê y hệt intel)** | ✅ Done (s71) — ma trận bod/staff × 18 báo cáo + per-user grant cộng dồn |
| Role data filters cho BI (SQL WHERE theo role) | ✅ Done — `/api/config/role-filters` |
| SQL Explorer (gohub_dw, admin only) | ✅ Done |
| Scheduled Lark Messages (Gemini → Lark cron) | ✅ Done |
| Partner Tiers config (Strategic partners) | ✅ Done |
| Lark ticket sync (Turso migrate + Lark Base API) | ✅ Done |

---

### ✅ Đã hoàn thành (cập nhật session 71 — trước ghi nhầm là defer)
- **Website Analytics (GA4)** — ✅ Done (s68): trang `/analytics/website` + B2C Section 4 (GA4 config trong Supabase app_settings).
- **GSC (Search Console)** — ✅ Done (s69). **Channel Costs UI** — ✅ migrate Turso→Supabase (s64).
- **Feedback page** — ✅ Done (`/analytics/feedback`). **B2C leads/spend/budget** — ✅ Done (s67–70, Chatwoot + Turso).

---

## 🔜 Còn Lại / Defer

### TODO thực tế
- **GA4 user count theo VN/US** — ✅ Đã xác minh hoàn thành trong Session 71 (đọc metric activeUsers thành công).
- **CS Troubleshoot — auto-sync** — ✅ Đã hoàn thành (cấu hình Vercel Cron @ 02:00 UTC và tích hợp token CRON_SECRET).
- **Verify Lark bot E2E** — fix routing s71 tự áp qua router chung; cần test 1 tin nhắn BI/template thật.

### Pending user cung cấp
- Quy tắc tạo template · mô tả cột dữ liệu · danh sách NCC chi tiết.

### Tính Năng Mới Tiềm Năng
- OnDemand Performance · Weekly digest tự động qua Lark.

---

## GitHub Actions

| Workflow | Trigger | Mô tả |
|---|---|---|
| `sync.yml` | Daily 01:00 UTC | GoHub API → Supabase |
| `data_sync.yml` | Push `Data/` + Daily 02:00 UTC | Reference xlsx → Supabase |
| `neo4j_sync.yml` | After sync success | Neo4j semantic fallback |
