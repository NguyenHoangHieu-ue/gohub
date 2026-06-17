# Merge Plan — GoHub PM + gohub-intel

**Tạo:** 2026-06-16  
**Ưu tiên:** CAO — làm trước tất cả task khác  
**Mục tiêu:** Merge hoàn toàn 2 project thành 1 app duy nhất trên Vercel

---

## Tổng Quan 2 Project

### GoHub PM (base — gohub-murex.vercel.app)
| | |
|---|---|
| Stack | Next.js 14 + Vercel + Supabase + NextAuth |
| Database | Supabase (products, SKUs, NCC, KB, wiki, users) |
| Auth | NextAuth — bcrypt + Lark login |
| Mục đích | Quản lý sản phẩm, catalog NCC, chatbot tư vấn SP, KB nội bộ |
| User chính | Team product, ops |
| Repo | github.com/NguyenHoangHieu-ue/gohub |

### gohub-intel (merge vào)
| | |
|---|---|
| Stack | React 19 + Vite + Express (9.500 dòng server.ts) + PostgreSQL + Clerk |
| Database | `gohub_dw` PostgreSQL 34.61.204.98 + Turso/SQLite (config/costs) |
| Auth | Clerk (test + prod key riêng) |
| Mục đích | Business Intelligence — doanh thu, hiệu suất kênh/nhân viên/B2B/B2C, AI analyst |
| User chính | BOD, sales, CS, toàn công ty |
| Local ZIP | D:\Kien_Thuc\Work\gohub\gohub-intel-main.zip |

### Quan hệ giữa 2 database
```
Supabase       = "sản phẩm phải bán gì"  (catalog, NCC, wiki)
gohub_dw (PG)  = "đã bán được bao nhiêu" (orders, revenue, channels, staff)
```
→ Hoàn toàn bổ trợ nhau, không overlap. Merged app cần cả 2 connections.

---

## Quyết Định Đã Chốt

| Vấn đề | Quyết định |
|---|---|
| Auth | Giữ **NextAuth** — migrate Clerk users → users table |
| Deploy | Giữ **Vercel** (gohub-murex.vercel.app, đổi domain sau nếu cần) |
| Base codebase | **GoHub PM** (Next.js) — port intel features vào |
| Approach | Merge **hoàn toàn** — 1 codebase, không proxy, không iframe |
| Phứơng án | Tuần tự Phase 1 → 5 |

---

## Danh Sách Tính Năng gohub-intel Cần Port

### Pages / Components (30 React components → Next.js client components)
| Component | Route đích | Role cần |
|---|---|---|
| DashboardHome.tsx | /analytics | all staff |
| BODReport.tsx | /analytics/bod | bod, admin |
| AllTimeReport.tsx | /analytics/all-time | bod, admin |
| WebsiteAnalytics.tsx | /analytics/website | bod, admin |
| ChannelPerformance.tsx | /analytics/channels | staff+ |
| B2BPerformance.tsx | /analytics/b2b | staff+ |
| B2CPerformance.tsx | /analytics/b2c | staff+ |
| StaffPerformance.tsx | /analytics/staff | admin, bod |
| CustomerPerformance.tsx | /analytics/customers | staff+ |
| VendorPerformance.tsx | /analytics/vendors | staff+ |
| ProductPerformance.tsx | /analytics/products | staff+ |
| OrderManagement.tsx | /analytics/orders | staff+ |
| FulfillmentReport.tsx | /analytics/fulfillment | staff+ |
| CSTroubleshootReport.tsx | /analytics/cs-troubleshoot | staff+ |
| ThreeHKDataUsage.tsx | /analytics/3hk-usage | staff+ |
| TargetPlanning.tsx | /analytics/targets | admin, bod |
| AIAgent.tsx | → merge vào /chatbot | all |
| SqlExplorer.tsx | /analytics/sql | admin only |
| ScheduledMessages.tsx | → merge vào Admin tab | admin |
| Feedback.tsx | /analytics/feedback | all staff |
| UserManagement.tsx | → merge vào Admin tab | admin |
| Settings.tsx (intel) | → merge vào Admin tab | admin |
| SchemaConfig.tsx | → merge vào Admin tab | admin |

### API Routes (80+ Express endpoints → Next.js API routes)
Tập trung ở server.ts (9500 dòng). Group theo phase:

**Phase 2 — Analytics core (~20 endpoints):**
- `/api/analytics/kpis`
- `/api/analytics/revenue-chart`
- `/api/analytics/region-chart`
- `/api/analytics/bod-report`
- `/api/analytics/bod-summary`
- `/api/analytics/bod-group-margin`
- `/api/analytics/bod-channel-performance`
- `/api/analytics/performance-source`
- `/api/analytics/performance-channel`
- `/api/analytics/b2b/*`
- `/api/analytics/targets-summary`
- `/api/analytics/recent-orders`
- `/api/analytics/fulfillment-report`
- `/api/analytics/gsc`
- `/api/analytics/ga4`

**Phase 3 — AI Agent (~2 endpoints):**
- `/api/query` (AI query với gohub_dw schema)
- `/api/schema`

**Phase 4 — Operations (~15 endpoints):**
- `/api/orders`, `/api/orders/export`
- `/api/staff-performance`, `/api/staff-list`
- `/api/customers`, `/api/staff`, `/api/channels`
- `/api/reports/cs-troubleshoot`
- `/api/order-sources`

**Phase 5 — Config & Admin (~30 endpoints):**
- `/api/channel-costs`, `/api/channel-group-costs`
- `/api/config/partner-tiers`, `/api/config/role-permissions`
- `/api/config/db`, `/api/config/schema`
- `/api/users` (Clerk → NextAuth migration)
- `/api/admin/sql-query`
- `/api/feedbacks`
- Lark scheduled messages (cron jobs)
- `/api/analytics/ga4`, `/api/config/ga4`

### Dependencies cần thêm vào GoHub PM
```json
"recharts": "^3.x",
"date-fns": "^4.x",
"html2canvas": "^1.x",
"jspdf": "^4.x",
"pg": "^8.x",
"@types/pg": "^8.x"
```

---

## Thay Đổi Database / Auth

### Roles mới (NextAuth)
```
Hiện tại:   admin | manager | standard
Thêm vào:   bod   | staff
Map từ Clerk: Admin→admin, BOD→bod, Staff→staff, Standard→standard
```

### Migration Users Clerk → NextAuth
1. Export user list từ intel: GET /api/users
2. INSERT vào Supabase `users` table với role mapping
3. Password: set random hash → user login qua Lark (đã có LarkProvider)
4. Xóa Clerk dependency sau khi xong

### Database mới: gohub_dw (PostgreSQL)
```
File mới: web/src/lib/analytics-db.ts
Dùng: pg.Pool
Host: 34.61.204.98 (port 5432)
DB: gohub_dw
User: gohub_dw_user
```

### Turso → Supabase Migration
Turso (libSQL) hiện chứa:
- `channel_costs` → Supabase table mới
- `channel_group_costs` → Supabase table mới
- `target_planning` → Supabase table mới
- `user_profiles` → merge vào `users` table
- `report_cache` → dùng Next.js caching thay
- `app_config` → merge vào `app_settings`
- `cost_input_settings` → Supabase table mới

SQL migration file: `database/migrations/v13_analytics_tables.sql`

### Env Vars cần thêm vào Vercel
```
ANALYTICS_DB_HOST=34.61.204.98
ANALYTICS_DB_PORT=5432
ANALYTICS_DB_NAME=gohub_dw
ANALYTICS_DB_USER=gohub_dw_user
ANALYTICS_DB_PASSWORD=<từ .env.example gohub-intel>
GA_PROPERTY_ID=<từ intel>
GOOGLE_APPLICATION_CREDENTIALS=<service account JSON>
```

---

## Kế Hoạch Thực Hiện (5 Phases)

### Phase 1 — Unified Shell ← ƯU TIÊN LÀM TRƯỚC
**Mục tiêu:** 1 app, 1 login, sidebar thấy cả PM + Analytics tabs

**Tasks:**
- [x] Thêm `recharts`, `pg`, `date-fns` vào package.json
- [x] Tạo `web/src/lib/analytics-db.ts` — pg.Pool kết nối gohub_dw
- [x] Thêm roles `bod` / `staff` vào sidebar (badge, label, visibility logic)
- [x] Tạo route group `(dashboard)/analytics/` với layout.tsx (role guard)
- [x] Thêm "Báo Cáo & BI" section vào sidebar.tsx (collapsible, role-based, blue active)
- [x] Tạo `web/src/lib/analytics-formatters.ts` (port từ intel)
- [x] Tạo `web/src/app/api/analytics/health/route.ts` (test DB connection)
- [x] Tạo 10 placeholder pages analytics (bod/channels/b2b/b2c/orders/staff/products/targets/fulfillment/cs-troubleshoot)
- [x] Migration v13_analytics_tables.sql tạo xong (cần chạy thủ công Supabase)
- [x] migrate_intel_users.py script tạo xong (cần điền danh sách users)
- [ ] ⚠️ **PENDING — Bạn cần làm:**
  1. Thêm env vars vào Vercel: `ANALYTICS_DB_HOST`, `ANALYTICS_DB_PORT`, `ANALYTICS_DB_NAME`, `ANALYTICS_DB_USER`, `ANALYTICS_DB_PASSWORD`
  2. Chạy `database/migrations/v13_analytics_tables.sql` trong Supabase SQL Editor
  3. Điền danh sách Clerk users vào `database/import/migrate_intel_users.py` rồi chạy
  4. Test: `/api/analytics/health` trả về `{"status":"ok"}`

**File thay đổi:** sidebar.tsx, auth.ts, types/next-auth.d.ts, lib/analytics-db.ts (new), database/migrations/v13_analytics_tables.sql (new)

---

### Phase 2 — Core Analytics Pages
**Mục tiêu:** Dashboard, BOD Report, B2B/B2C, Channel hoạt động đầy đủ
**Trạng thái:** ✅ Done — commit bcf51ec (2026-06-16)

**Tasks:**
- [x] Port API: /api/analytics/kpis, revenue-chart, region-chart (từ server.ts)
- [x] Port API: /api/analytics/bod-* (4 endpoints lớn nhất)
- [x] Port API: /api/analytics/performance-source, performance-channel
- [x] Port API: /api/analytics/b2b/{kpis,trend,performance,strategic-performance}
- [x] Port API: /api/analytics/b2c/{kpis,trend,performance}
- [x] Port API: /api/analytics/channels/{kpis,trend,performance}
- [x] Port API: /api/analytics/recent-orders, targets-summary, /api/config/partner-tiers
- [x] analytics-helpers.ts: shared SQL helpers (getDateFilter, getAnalyticsSource, getGroupCaseSQL)
- [x] Port component: DashboardHome.tsx → analytics/page.tsx
- [x] Port component: BODReport.tsx → analytics/bod/page.tsx
- [x] Port component: ChannelPerformance.tsx → analytics/channels/page.tsx
- [x] Port component: B2BPerformance.tsx → analytics/b2b/page.tsx
- [x] Port component: B2CPerformance.tsx → analytics/b2c/page.tsx
- [x] Port analytics logic: ANALYTICS_LOGIC.md rules vào API routes
- [x] Sidebar: Analytics tabs phân nhóm 4 sections (Tổng Quan / Doanh Thu / Vận Hành / Phân Tích)

**⚠️ Pending — cần bạn làm để data hiện thị:**
1. Set Vercel env vars: ANALYTICS_DB_HOST, ANALYTICS_DB_PORT, ANALYTICS_DB_NAME, ANALYTICS_DB_USER, ANALYTICS_DB_PASSWORD
2. Test: GET /api/analytics/health → `{"status":"ok"}`
3. (Optional) Set partner_tiers trong Supabase app_settings để Strategic Partners filter hoạt động

**Phần chưa port (defer Phase 4):**
- CostManagementModal (channel costs GPM2 calculation)
- PDF export (jsPDF)
- Cost management UI
- AllTimeReport, WebsiteAnalytics (GA4), VendorPerformance, CustomerPerformance, StaffPerformance

---

### Phase 3 — Merge AI Agent
**Mục tiêu:** 1 chatbot trả lời được cả product catalog VÀ business analytics  
**Trạng thái:** ✅ Done — commit ec1cd47 (2026-06-16)

**Tasks:**
- [x] Thêm agent `bi-analyst` vào agents.ts (system prompt biết về gohub_dw schema)
- [x] Port /api/query logic (AI → SQL → gohub_dw → trả kết quả) — dùng executeSQL tool + queryAnalytics()
- [x] Router rule: detect câu hỏi BI ("doanh thu", "đơn hàng", "kênh bán", "target"...)
- [x] Chart rendering trong chatbot (chat-chart.tsx → render ```chart blocks)
- [x] Port /api/schema → /api/analytics/schema (trả gohub_dw schema, cached 1h)

---

### Phase 4 — Operations & Reports
**Trạng thái:** ⏳ Đang làm — commit 3dced79 (2026-06-17) — phần lõi xong

**Done (commit 3dced79):**
- [x] Port: Orders (API + UI) — /analytics/orders
  - /api/orders, /api/orders/export, /api/channels, /api/staff, /api/order-sources
- [x] Port: Staff Performance — /analytics/staff
  - /api/staff-performance, /api/staff-list
- [x] Port: Fulfillment Report — /analytics/fulfillment
  - /api/analytics/fulfillment-report

**Done session 59 tiếp:**
- [x] Port: Customer Performance — /analytics/customers (commit f4c69d4)
- [x] Port: Product Performance (analytics) — /analytics/products (commit c2e7eae)
- [x] Port: Target Planning — /analytics/targets (commit c2e7eae)

**Done session 59 tiếp 4 (commit 7e72b5c):**
- [x] Port: CS Troubleshoot — /analytics/cs-troubleshoot
  - Migration v14_lark_cs_tickets.sql (cần chạy thủ công trong Supabase)
  - Ticket data từ Supabase lark_cs_tickets thay Turso
- [x] Port: 3HK Data Usage — /analytics/3hk-usage
  - Hoàn toàn từ fact_data_usage (gohub_dw), không cần dữ liệu ngoài

**Còn lại (defer Phase 5 hoặc low priority):**
- [ ] Port: All-Time Report — /analytics/all-time
- [ ] Port: Website Analytics (GA4) — /analytics/website (deps: Google service account)

---

### Phase 5 — Config & Admin Complete
**Tasks:**
- [ ] Merge UserManagement.tsx → Admin tab Users (thay thế/mở rộng existing)
- [ ] Port: Channel Costs UI → Admin tab Settings
- [ ] Port: Scheduled Lark Messages → Admin tab / existing Lark integration
- [ ] Port: SQL Explorer → Admin tab (admin only)
- [ ] Port: Schema Config → Admin tab
- [ ] Port: Settings (intel) → merge vào Admin tab Cài đặt
- [ ] Port: Feedback → /analytics/feedback
- [ ] Port: Partner Tiers config → Admin tab
- [ ] Port: GA4 config → Admin tab
- [ ] Xóa Clerk dependency hoàn toàn

---

## Analytics Logic Cần Implement (từ ANALYTICS_LOGIC.md)

### Quan trọng — phải giữ đúng khi port:
1. **Strategic vs Channel (B2B):** Không double-count Klook/Traveloka
   - `Adjusted_Channel_Revenue = Channel_Total - Strategic_Contributions`
2. **Projection:** Chỉ tính khi đang trong tháng hiện tại
   - `factor = totalDaysInMonth / daysElapsed`
3. **MoM:** So sánh exact day-range (May 1-15 vs Apr 1-15)
4. **SKU Destination:** Parse country code từ SKU (index 3, 3 chars)

---

## Lịch Sử & Trạng Thái

| Phase | Trạng thái | Session |
|---|---|---|
| Phase 1 — Unified Shell | ✅ Done | Session 55 — commit 3c39349 |
| Phase 2 — Core Analytics | ✅ Done | Session 56 — commit bcf51ec |
| Phase 3 — Merge AI Agent | ✅ Done | Session 57 — commit ec1cd47 |
| Phase 4 — Operations | ⏳ Đang làm (lõi done) | Session 59 — commit 3dced79 |
| Phase 5 — Config & Admin | 🔜 Chưa làm | — |

---

## Files Quan Trọng gohub-intel (tham khảo khi port)

```
server.ts                          ← toàn bộ backend (9500 dòng, 80+ API routes)
src/App.tsx                        ← navigation structure, tab definitions
src/constants.ts                   ← AVAILABLE_REPORTS list
src/types.ts                       ← shared types
src/components/AuthContext.tsx     ← Clerk auth context → replace bằng NextAuth
src/components/AIAgent.tsx         ← BI chatbot → merge vào chatbot/page.tsx
src/components/DashboardHome.tsx   ← home dashboard
src/components/BODReport.tsx       ← BOD report
src/components/B2BPerformance.tsx  ← B2B analytics
src/components/B2CPerformance.tsx  ← B2C analytics
src/components/ChannelPerformance.tsx
src/lib/formatters.ts              ← formatCurrency, formatNumber...
src/lib/utils.ts                   ← cn() helper
DOCS/ANALYTICS_LOGIC.md           ← business rules PHẢI tuân theo khi port
.env.example                       ← env vars cần add vào Vercel
```
