# GoHub — Trạng Thái Hệ Thống & Roadmap

**Cập nhật lần cuối:** 2026-07-16 (session 95 — **Wave 0.1 Toast** + **3HK sub-report Usage by Country** + **agent chatbot mới "Kho Dữ Liệu" (data-explorer)** truy xuất toàn hệ thống). Chi tiết diễn biến từng phiên: `docs/session_summary.txt` (nguồn sự thật).

> **Production (main) = staging** — deploy liên tục qua s91–95. s93: fix ecom B2C + 3HK khớp NCC. s94: wiki chi tiết 28 tab + `_analytics-data-model.md` + sync KB (47 pages); **lập PLAN UX nâng cấp tab SP/hệ thống** (xem mục 🎨 bên dưới, chi tiết `docs/plan-ux-tabs.md`). s95: bắt đầu Wave 0 (Toast) + 3HK country table + data-explorer agent.
> ✅ Migration `web/db/migrations/v17_b2c_report_monthly_snapshots.sql` **đã chạy** (Hiếu, s95) → cron pre-compute snapshot B2C hoạt động.

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
| **Creator Dev Tools** (API Tester + duyệt Supabase DB, CHỈ creator) | ✅ Done (s90) — `/analytics/creator/devtools`, auto-discover route/bảng |

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

### Vận hành (chốt s86, 2026-07-01)
- **CRON_SECRET** — ✅ đã set trên Vercel (cron prewarm analytics 06:30 ICT auth OK).
- **Cache analytics 2 tầng TTL 12h + prewarm** — ✅ đang chạy (thay cho bản 10' cũ).
- **Index gohub_dw** — ❌ bỏ qua (không có quyền DB); cache trong app là fix cuối.
- **3HK `fact_data_usage` sync tháng 6** — 🔜 chưa cần (tab dùng kỳ tháng 5, data đến 30/05).

### Pending user cung cấp
- Quy tắc tạo template · mô tả cột dữ liệu · danh sách NCC chi tiết.

### Tính Năng Mới Tiềm Năng
- OnDemand Performance · Weekly digest tự động qua Lark.

---

## 🎨 PLAN UX — Nâng Cấp Các Tab SP/Hệ Thống (từ s94, 2026-07-15)

> **Bối cảnh & mục tiêu**: nâng cấp trải nghiệm các tab **NGOÀI analytics** (analytics tạm gác) theo tiêu chí Hiếu đặt ra:
> **tiện lợi · tiện ích · thông minh · đầy đủ · cần thiết · dễ tiếp cận · hiện đại**.
> Phạm vi tab: `skus, ncc, countries, promotions, kb, info, chatbot, admin`.
> **Chi tiết đầy đủ (việc cụ thể + file + "xong khi")**: `docs/plan-ux-tabs.md`. Trạng thái: **đã lập plan, CHƯA code**.

**Hiện trạng hạ tầng (khảo sát s94)**: đã có search/filter/export/modal + `confirm-modal`/`pager`/`dashboard-kit`/`sidebar-main`/`top-bar`.
Còn **THIẾU**: toast · command palette · skeleton · tooltip dùng chung; **dark mode chưa đồng bộ**; `dashboard-kit` mới dùng ở vài trang analytics → 8 tab SP/hệ thống UX rời rạc. Page lớn: admin 1836 · ncc 1033 · kb 992 · skus 983 · chatbot 758 dòng.

**Quyết định của Hiếu**: làm **WAVE 0 (nền dùng chung) TRƯỚC**, rồi đào sâu **skus · ncc · kb · chatbot**.

### 🅰️ Wave 0 — Nền dùng chung (nâng mọi tab cùng lúc) — thứ tự triển khai
1. **0.1 Toast** ✅ **XONG (s95)** — `components/toast.tsx` (`ToastProvider` + `useToast`, gắn ở `(dashboard)/layout`, stack góc phải, tự tắt 3s, dark-mode). Đã thay toàn bộ `alert()` (cs-troubleshoot·orders·products·scheduled·chatbot·ncc). **Bước tiếp: 0.2 Skeleton.**
2. **0.2 Skeleton** ✅ **XONG (s95)** — `components/skeleton.tsx` (`Skeleton`/`SkeletonText`/`SkeletonTable`/`SkeletonCards`/`SkeletonList`, dark-mode). Áp `SkeletonTable` cho countries·promotions·kb (docs+wiki). skus·ncc đã có row-skeleton sẵn (giữ). **Bước tiếp: 0.6 Empty/Help + tooltip** (hoặc 0.3 ⌘K).
3. **0.6 Keyboard + Empty/Help** (`/` focus search, `Esc` đóng, ↑↓ duyệt; `empty-state.tsx` + `tooltip.tsx`). *(tiện lợi, đầy đủ, dễ tiếp cận)*
4. **0.5 Design-kit + Dark mode** — chuẩn hoá token từ `dashboard-kit` + bổ sung `dark:` cho 8 tab. *(hiện đại, dễ tiếp cận)*
5. **0.4 URL-state filter** (`useUrlState` → lưu filter/search/page vào query param). *(tiện lợi)*
6. **0.3 Command Palette `⌘/Ctrl+K`** (`components/command-palette.tsx`) — nhảy tab/SKU/nước/wiki + hành động nhanh, gọi search API sẵn có. *(thông minh, dễ tiếp cận, hiện đại)*
7. **0.7 Mobile responsive** — table→card view < md, sidebar off-canvas. *(dễ tiếp cận)*

### 🅱️ Wave 1 — Đào sâu 4 tab ưu tiên (sau Wave 0)
- **skus**: detail drawer điều hướng Product↔SKU↔Listing↔Item (đọc JSONB `metadata`) · saved views · bulk action · copy mã · import CSV.
- **ncc**: **Gap dashboard** (đếm `exist='No'` theo NCC/nước) + **tạo SKU 1-click từ gap** · import wizard stepper 3 bước + preview diff · preset template.
- **kb**: semantic search + filter · editor markdown **live-preview** · **diff version** (`kb_wiki_versions`) · nút "Hỏi AI về tài liệu này" · drag-drop upload + progress (`kb_processing_jobs`).
- **chatbot**: gợi ý câu hỏi (chips) · sidebar lịch sử (`conversations`/`chat_messages`) · copy/📤 export câu trả lời · 👍👎 feedback · chọn agent thủ công · streaming mượt.

### Nguyên tắc thực thi
- Mỗi mục = **1 commit**, **staging-first**, verify **tsc·vitest·build**, deploy dần.
- Sau mỗi thay đổi: cập nhật wiki tab tương ứng (`docs/wiki/Tab/`) + sync KB.
- **KHÔNG đụng tab analytics**; giữ nguyên nghiệp vụ/dữ liệu — đây là lớp UX/tiện ích.
- **Bước tiếp theo**: Wave 0 mục **0.6 Empty/Help + tooltip** hoặc **0.3 Command Palette ⌘K** (0.1 Toast + 0.2 Skeleton đã xong s95).

---

## 🆕 Session 95 (2026-07-16) — Toast + 3HK Country + Data Explorer agent

1. **Wave 0.1 Toast** ✅ (xem mục 🎨 ở trên).
2. **3HK Data Usage — sub-report "Data Usage by Country × Month (TB)"**: bảng country × tháng đọc `data_usage_log`
   (nguồn thô có cột `country`), TB = `SUM(data_gb)/1024`, top 16 nước + gộp **OTHERS**, cột **Total** + **Run-rate 12M**
   (tháng mới nhất × 12), dòng **GRAND TOTAL**, nút export **CSV**. Query gom country×tháng dạng dài rồi pivot client-side;
   độc lập kỳ/tab (12 tháng gần nhất, bỏ `report_date NULL`). Số khớp mẫu NCC (China Jun 131,91 · Grand Jun 186,80).
   File: `app/(dashboard)/analytics/3hk-usage/page.tsx`.
3. **Chatbot — agent mới "Kho Dữ Liệu" (`data-explorer`, 🗄️)**: truy xuất DỮ LIỆU THÔ toàn hệ thống — tool `executeSQL`
   (gohub_dw) + `querySupabase` (REST select 26 bảng catalog/config) + `listSupabaseTables`. Trả nhanh "đếm/liệt kê/tra bảng".
   File mới `lib/agents/data-explorer.ts`; đăng ký `types`/`agents`/`classifier`(intent `data_explore`)/`router`(override
   `DATA_EXPLORE_RE`); dispatch ở `/api/chat` + `/api/lark/events` (giống bi-analyst, non-stream); badge+chart ở chatbot page.
   **Guardian/bảo mật**: guardCheck (message-level) vẫn chạy trước; TẦNG agent: bảng nhạy cảm (users/hội thoại/ticket/
   app_settings) chỉ admin·creator; role không phải admin chèn `role_filters` vào SQL gohub_dw; lược cột COGS nếu không có
   quyền xem giá vốn; luôn lược cột `embedding`. Verify: tsc · vitest 28/28 · next build PASS.

---

## GitHub Actions

| Workflow | Trigger | Mô tả |
|---|---|---|
| `sync.yml` | Daily 01:00 UTC | GoHub API → Supabase |
| `data_sync.yml` | Push `Data/` + Daily 02:00 UTC | Reference xlsx → Supabase |
| `neo4j_sync.yml` | After sync success | Neo4j semantic fallback |
