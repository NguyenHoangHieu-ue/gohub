# GoHub Intel — Operations Runbook
> Audit + Hardening s159 · 2026-08-24 · Vai trò: Senior Systems Architect + DevSecOps
> Commits: e190aaf (rate limit + cron auth) · 8c64e9c (H1-H3/M1-M3/L1)

---

## 1. Kiến trúc tổng quan

```
Browser / Lark Bot
      │
      ▼
[Vercel Edge] ── middleware.ts (withAuth, JWT check) ─→ /login nếu chưa auth
      │
      ▼
[Next.js 14 API Routes]
      ├── /api/analytics/*    ← gọi gohub_dw (GCP Postgres, read-only)
      ├── /api/admin/*        ← gọi Supabase (service key)
      ├── /api/chat           ← Gemini AI → Bé Gấu
      ├── /api/creator-ai/*   ← Gemini AI → Gấu Pro
      ├── /api/lark/events    ← Lark Bot webhook (decrypt AES-256-CBC)
      ├── /api/cron/*         ← 7 cron jobs (Vercel + GitHub Actions)
      └── /api/to-gau/*       ← Tổ Gấu messaging
      │
      ├── gohub_dw (GCP Cloud SQL Postgres)  ← ANALYTICS, read-only
      │     pool max=3, statement_timeout=25s, idle_session_timeout=90s
      ├── Supabase PostgreSQL                ← Products / KB / Config / Users
      └── Turso SQLite                       ← B2B costs / Quarterly targets
```

---

## 2. Auth & Phân quyền

### 2.1 Authentication flow

| Phương thức | Cơ chế |
|---|---|
| Credentials | username/password → bcrypt.compare → NextAuth JWT |
| Lark OAuth | Lark open_id → map DB → nếu không có → auto-create role=staff |
| JWT maxAge | 7 ngày (roles không refresh tự động trong thời gian này) |

**⚠️ Lưu ý:** Role thay đổi trên DB KHÔNG phản ánh ngay vào JWT đang hoạt động. Admin pages gọi `/api/user/me` để lấy role tươi (hook `use-role-guard`). Analytics pages dùng JWT cũ cho đến khi re-login.

### 2.2 Role matrix

| Role | Quyền |
|---|---|
| `creator` | Super-admin: mọi tab + mọi API |
| `admin` | Hầu hết analytics + admin UI |
| `manager` | Analytics (trừ admin tools) |
| `bod` | Báo cáo BOD + analytics theo cấu hình |
| `staff` / `b2b` / `b2c` / `saleb2c` / `ops-&-cs` / `hr` / `product` | Theo `role_permissions` trong `app_settings` |

### 2.3 Middleware protection

```typescript
// middleware.ts
matcher: ["/products/:path*", "/skus/:path*", "/listings/:path*",
          "/items/:path*", "/chatbot/:path*", "/admin/:path*", "/analytics/:path*"]
```

Tất cả route trên đều yêu cầu session. API routes thêm `getServerSession()` check ở handler.

---

## 3. Cron Jobs — Lịch & Chức năng

> **Múi giờ:** vercel.json dùng UTC. ICT = UTC+7.

| Cron | Schedule (UTC) | Giờ ICT | Chức năng |
|---|---|---|---|
| `scheduled-messages` | `0 1 * * *` | 08:00 | Gửi Lark messages theo lịch |
| `sync-lark-tickets` | `0 2 * * *` | 09:00 | Sync CS tickets từ Lark Base |
| `refresh-monthly-kpis` | `30 1 * * *` | 08:30 | Update analytics_monthly_kpis |
| `prewarm-analytics` | `0 2 * * *` | 09:00 | Cache warm analytics queries |
| `refresh-b2c-report` | `30 2 * * *` | 09:30 | B2C monthly snapshot |
| `refresh-trends` | `0 1 * * *` | 08:00 | Thu thập trend data (web search) |
| `bc-sync` | `0 0 * * *` | 07:00 | Sync BC Datapool |
| `ca-thread-remind` | `0 3 * * 1` | 10:00 Thứ Hai | Nhắc cà thread Lark |

ETL gohub_dw chạy ~08:00 ICT. Thứ tự cron sau s159: ETL (08:00) → kpis (08:30) → prewarm (09:00) → b2c-report (09:30). ✅ Đúng thứ tự.

### 3.1 Dedup scheduled-messages

Có 2 trigger đồng thời: Vercel cron (1 lần/ngày) + GitHub Actions (*/15 min). Hệ thống xử lý bằng **atomic claim** — chỉ 1 caller "chiếm" slot qua Supabase optimistic lock. Pattern đúng, nhưng GitHub Actions gửi request thừa nhiều lần/ngày.

### 3.2 Cron auth pattern (sau s159)

| Cron | Auth method | Trạng thái |
|---|---|---|
| `prewarm-analytics` | `Authorization: Bearer $CRON_SECRET` (fail nếu env rỗng) | ✅ |
| `scheduled-messages` | `Authorization: Bearer $CRON_SECRET` (fail nếu env rỗng) | ✅ |
| `refresh-trends` | `Authorization: Bearer $CRON_SECRET` | ✅ fixed s159 |
| `bc-sync` | `Authorization: Bearer $CRON_SECRET` | ✅ |
| `ca-thread-remind` | `Authorization: Bearer $CRON_SECRET` | ✅ |
| `refresh-b2c-report` | `Authorization: Bearer $CRON_SECRET` (fail nếu env rỗng) | ✅ fixed s159 |
| `refresh-monthly-kpis` | `isCronReq()` Bearer header | ✅ |
| `sync-lark-tickets` | Admin session required | ✅ |

---

## 4. Database Connections

### 4.1 gohub_dw (GCP Postgres)

```
Pool max=3 · statement_timeout=25s · connectionTimeout=8s
idle_session_timeout=90s (server-side, fix Vercel freeze leak)
Retry: 3 lần, backoff 400ms/800ms cho transient errors
```

- **Read-only**: Hiếu không có DDL quyền
- **SSL**: `rejectUnauthorized: false` (không verify cert — xem §6 risks)
- **Cutoff**: data đến CURRENT_DATE - 1 (ETL 08:00 ICT)

### 4.2 Supabase

- `supabase` client: anon key (NEXT_PUBLIC) → RLS rules apply (nếu có)
- `supabaseAdmin` client: service key → bypass RLS — **chỉ dùng server-side**
- Không có RLS trên hầu hết bảng (toàn bộ access control ở application layer)

### 4.3 Turso

- Config B2B costs + quarterly targets
- Chỉ read từ analytics routes, write từ admin

---

## 5. Chatbot Architecture

### 5.1 Bé Gấu (Team chatbot)

```
POST /api/chat
  → Guardian pre-flight (chặn system_internal / injection / PII)
  → getChannelFromRole() (filter giá theo kênh user)
  → runBeGau() [Gemini function-calling, ≤12 iterations]
  → Stream response
  → logChat() fire-and-forget
```

**Tools Bé Gấu:** executeSQL (gohub_dw), querySupabase, queryProduct, queryGA4, queryGSC, webSearch, readKnowledgeBase

### 5.2 Gấu Pro (Creator only)

```
POST /api/creator-ai/chat
  → No guardian, full access
  → runCreatorAI() [16+ tools, ≤20 iterations]
  → Stream response
```

### 5.3 Lark Bot

```
POST /api/lark/events
  → Decrypt AES-256-CBC (LARK_ENCRYPT_KEY)
  → alreadyHandled(eventId) — dedup via app_settings key=larkevt:*
  → getUserRole(open_id) từ Supabase
  → Guardian check
  → runBeGau()
  → replyLarkMessage()
```

---

## 6. Security Profile

### 6.1 Tốt (✅)

- Middleware auth: tất cả protected routes đều check JWT
- SQL injection: `safeDate()` + `safeCompanyCode()` + ALLOWED/BLOCKED regex
- Multi-statement SQL prevention: kiểm tra `;` sau trim
- Cron dedup: atomic claim pattern (Supabase optimistic lock)
- Lark payload: AES-256-CBC decrypt với key hash SHA-256
- Password: bcrypt (bcryptjs)
- Server-side rendering với service key ở server only (không leak)
- Guardian chatbot: regex-based pre-flight + multi-tier blocking
- Chat error differentiation: lỗi chi tiết chỉ cho admin/creator

### 6.2 Status sau s159

| # | Vấn đề | Mức độ | Trạng thái |
|---|---|---|---|
| S1 | Rate limiting chat/creator-ai | CRITICAL | ✅ **Fixed** — 20/10 req/min |
| S2 | `refresh-trends` dùng `?secret=` query param | HIGH | ✅ **Fixed** — đổi sang header |
| S3 | CRON_SECRET rỗng → skip auth | HIGH | ✅ **Fixed** — return false |
| S4 | `refresh-b2c-report` không auth | HIGH | ✅ **Fixed** |
| S5 | `ssl: {rejectUnauthorized: false}` | HIGH | ⚠️ **Partial** — conditional khi có ANALYTICS_DB_SSL_CA; gohub_dw không phải DB của GoHub → bỏ qua |
| S6 | Lark không verify X-Lark-Signature | MEDIUM | ✅ **Fixed** — `LARK_VERIFICATION_TOKEN` đã set Vercel ✅ |
| S7 | JWT 7-day maxAge, role stale | MEDIUM | ✅ **Fixed** — 1 ngày |
| S8 | Hardcode fallback host IP/DB | MEDIUM | ✅ **Fixed** — throw Error nếu env thiếu |
| S9 | Netlify URL hardcode trong auth.ts | LOW | ⚠️ Tồn tại (legacy, ít ảnh hưởng) |
| S10 | Lark dedup entries không bao giờ xóa | LOW | ✅ **Fixed** — ca-thread-remind cleanup mỗi thứ 2 |
| S11 | Không có CSP headers | LOW | ✅ **Fixed** — next.config.js |
| S12 | Không có request body size limit | LOW | ⚠️ Còn đó (risk thấp, internal tool) |

---

## 7. Rate Limiting — Trạng thái & Khuyến nghị

**Hiện tại:** KHÔNG có rate limiting.

**Điểm nóng cần protect:**

| Endpoint | Risk | Limit gợi ý |
|---|---|---|
| `POST /api/chat` | Gemini API cost | 20 req/min/user |
| `POST /api/creator-ai/chat` | Gemini API cost (cao hơn) | 10 req/min/user |
| `POST /api/analytics/query` | DB pool exhaustion | 60 req/min/user |
| `POST /login` | Brute force password | 5 req/min/IP |
| `POST /api/lark/events` | Bot spam | 100 req/min (global) |

**Options:**
1. **Vercel Rate Limiting** (built-in, cần Vercel Pro): config trong vercel.json, zero-code
2. **Upstash Redis** + `@upstash/ratelimit`: sliding window, per-user, ~$0/tháng (10K req free)
3. **Edge middleware** tự viết: dùng `NextResponse` + in-memory Map (không persistent across instances)

---

## 8. UX & Reliability

### 8.1 Tốt

- Streaming chat responses (ReadableStream)
- Error message chuẩn: "Hiếu đang fix, vui lòng đợi"
- Loading skeletons (Wave 0.2 done)
- Toast notifications (Wave 0.1 done)
- Smart scroll Tổ Gấu (s158)
- Cron failure → Lark alert (cron-alert.ts) — nhưng chỉ prewarm + scheduled-messages + refresh-trends

### 8.2 Gap

| # | Vấn đề | Ảnh hưởng |
|---|---|---|
| U1 | Không cancel request khi navigate (client-side fetch) | Stale request hoàn thành sau khi user rời trang |
| U2 | Cron alert thiếu: bc-sync, refresh-b2c, refresh-kpis không alert khi fail | Silent failure không ai biết |
| U3 | Không có request ID/correlation → debug khó | Khó trace lỗi qua Vercel logs |
| U4 | SWR/React Query chưa dùng nhất quán | Không stale-while-revalidate cho analytics pages |
| U5 | Quarterly routes chỉ `maxDuration: 60` → một số complex query vẫn có thể timeout | |
| U6 | Không có global error boundary ở page level cho analytics | Lỗi 1 component có thể crash toàn trang |

---

## 9. Cron Schedule tối ưu (đề xuất)

```
ETL gohub_dw = ~08:00 ICT (01:00 UTC)

Đề xuất sắp xếp lại:
  01:30 UTC (08:30 ICT) → refresh-monthly-kpis  [sau ETL 30 phút]
  02:00 UTC (09:00 ICT) → prewarm-analytics      [sau kpis xong]
  02:00 UTC (09:00 ICT) → refresh-b2c-report     [ổn định, data không phụ ETL]
  02:00 UTC (09:00 ICT) → bc-sync               [ổn định]
  01:00 UTC (08:00 ICT) → refresh-trends         [web search, không phụ ETL — OK giữ]
  02:00 UTC (09:00 ICT) → sync-lark-tickets      [ổn định]
  01:00 UTC ngày làm việc → scheduled-messages    [OK]
  03:00 UTC Thứ 2 (10:00) → ca-thread-remind      [OK]
```

---

## 10. Monitoring & Alerting

| Hiện có | Missing |
|---|---|
| Lark alert khi cron fail (cron-alert.ts) | Alert cho bc-sync, refresh-b2c, refresh-kpis fail |
| Vercel function logs | Không có aggregated error dashboard |
| DB health check endpoint `/api/analytics/health` | Không có uptime monitor |
| `analyticsGuard` log errors | Không có rate-of-error tracking |

**Khuyến nghị:**
- Thêm `alertCronFailure` vào tất cả cron không có
- Setup Vercel Integration với PagerDuty/Slack nếu Vercel Pro
- Dùng `sentry.io` free tier cho error tracking (Next.js SDK tích hợp dễ)

---

## 11. Dependency & External Services

| Service | Dùng cho | Single point of failure? |
|---|---|---|
| Gemini (Google AI) | Chatbot, image gen, web search | Có — nếu Gemini down, chat down |
| Supabase | Users, KB, config | Có — auth + config |
| gohub_dw (GCP) | Analytics data | Có — toàn bộ báo cáo |
| Lark API | Bot + OAuth | Một phần — OAuth fail → chỉ credentials login |
| Pollinations AI | Image gen (Gấu Pro) | Không critical |
| GitHub Actions | scheduled-messages trigger | Không — Vercel cron là backstop |

---

## 12. Checklist vận hành định kỳ

### Hàng ngày (tự động)
- [ ] Vercel cron jobs chạy đúng giờ (check Vercel dashboard)
- [ ] Lark alert nếu có cron fail
- [ ] DB pool không bị cạn (check analytics health endpoint)

### Hàng tuần
- [ ] Kiểm tra `app_settings` bảng có tăng nhanh không (lark dedup entries)
- [ ] Review Vercel function log errors
- [ ] Xác nhận gohub_dw data cutoff đúng (max fulfiled_date = hôm qua)

### Hàng tháng
- [ ] Review JWT sessions (có user nào cần revoke không)
- [ ] Xóa lark dedup entries cũ: `DELETE FROM app_settings WHERE category='lark_dedup' AND updated_at < NOW() - INTERVAL '7 days'`
- [ ] Review Gemini API usage + cost
- [ ] Kiểm tra trend_snapshots không duplicate (same date + category)

---

## 13. Incident Response

### DB connection exhausted (gohub_dw)
```
Triệu chứng: "remaining connection slots reserved for superuser"
1. Check Vercel function count (nhiều instance đang active?)
2. Đợi 90s (idle_session_timeout tự đóng)
3. Nếu khẩn: tạm thời tắt prewarm cron
4. Long-term: xem xét PgBouncer/connection pooler phía DB
```

### Gemini API quota exceeded
```
Triệu chứng: chat trả lỗi 429
1. Check Google Cloud console quota
2. Tạm thời: tắt Gấu Pro (creator-ai) để dành quota cho Bé Gấu
3. Long-term: thêm rate limiting per-user
```

### Cron không chạy
```
1. Check Vercel cron logs (Settings → Crons trong Vercel dashboard)
2. Check CRON_SECRET env đã set chưa
3. Manual trigger: curl -H "Authorization: Bearer $CRON_SECRET" https://gohub-intel.vercel.app/api/cron/prewarm-analytics
```

### Lark bot không trả lời
```
1. Check Lark app → Events & Callbacks → đang active?
2. Check LARK_ENCRYPT_KEY, LARK_APP_ID, LARK_APP_SECRET env
3. Check /api/lark/events Vercel function logs
4. Check lark_chat_history bảng Supabase (có insert không?)
```
