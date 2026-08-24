# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.

---

## Trạng thái hiện tại (2026-08-24, s159)

| | |
|---|---|
| Branch làm việc | `staging` (làm việc ở đây, merge main **CHỈ khi Hiếu yêu cầu RÕ RÀNG** trong chính tin nhắn đó) |
| tsc | PASS |
| ⏳ Trên staging CHƯA merge main | (clean — tất cả đã lên main 668c2cf) |
| ✅ Đã lên main | Wave 1+2+3 + C2/D1/D3 + Squad Progress + UI polish + fix Daily Report + Squad CM1 + 3HK Rev + Tổ Gấu fixes + Wiki 3-tier (đến 668c2cf) |

**➡️ TIẾP THEO:** Hiếu cấp quyền GA4 App cho service account → test toggle App trong Web Analytics. Test Daily Report để xác nhận số khớp Dashboard.

**s159 — đã làm (2026-08-24):**
- ✅ **Full system audit** (luồng vận hành, bảo mật, rate limit, UX, cron, DB)
- ✅ **Security hardening** — 2 commit (e190aaf + 8c64e9c):
  - Rate limiting: 20 req/min Bé Gấu, 10 req/min Gấu Pro (`lib/rate-limit.ts`)
  - Cron auth: refresh-trends đổi `?secret=` → `Authorization` header; fix bypass khi CRON_SECRET rỗng (4 cron routes)
  - Lark signature: `verifyLarkSignature` (HMAC-SHA256, cần set `LARK_VERIFICATION_TOKEN`)
  - SSL gohub_dw: conditional `rejectUnauthorized: true` khi có `ANALYTICS_DB_SSL_CA` env
  - JWT maxAge: 7 ngày → 1 ngày
  - Cron timing: prewarm/kpis/b2c dời sang 08:30-09:30 ICT (sau ETL 08:00)
  - Lark dedup cleanup: ca-thread-remind xóa entries >7 ngày mỗi thứ 2
  - Hardcode fallback: xóa host IP/DB name/user fallback → throw Error nếu env chưa set
  - CSP headers: X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, CSP
- ✅ **Ops wiki**: `docs/wiki/system/Operations-Runbook.md` (luồng, auth, cron, incident response)

**⚠️ QUY TẮC MERGE (nhắc lại):** KHÔNG tự merge main. "tiếp tục"/"làm tiếp" = chỉ push staging. Chỉ merge khi Hiếu nói "merge main" trong CHÍNH tin đó.

**Migrations & ENV — đã xong:**
- [x] ✅ v31–v35 (cũ) · v36 BC Datapool · v37 staff hk3 split
- [x] ✅ v38 `target_rev` + v39 `target_3hk_rev` trên `b2b_customer_targets`
- [x] ✅ **v40 `ca_thread_log`** (lịch sử cà thread)
- [x] ✅ **v41 `access_audit_log`** (audit log cấp quyền)
- [x] ✅ ENV Vercel: `BC_DATAPOOL_*` · `LARK_CREATOR_USER_ID`

**Hiếu cần làm (còn lại, s159+):**
- [x] ✅ **Vercel env**: `LARK_VERIFICATION_TOKEN` đã set Production + Preview
- [x] ✅ **Vercel env**: `ANALYTICS_DB_HOST` / `ANALYTICS_DB_NAME` / `ANALYTICS_DB_USER` đã xác nhận

**Hiếu cần làm (còn lại, cũ):**
- [ ] Liên hệ DB owner gohub_dw cho Looker Studio / Power BI
- [ ] **Portal Affiliate**: nhập App ID + Secret Shopee Affiliate Open API
- [ ] **BC Datapool — lấy appSecret đúng từ BC support**
- [ ] **Cà Thread**: thêm bot Bé Gấu vào group Lark + bật scope `im:message` & `im:message.reaction:readonly` + publish version mới
- [ ] **Cà Thread**: Kết nối Lark cá nhân (Creator page → Kết nối Lark)
- [ ] **Test Wave 1.1** trên staging: cà 1 thread → reload → còn badge "Đã cà" + section Lịch sử → nếu OK → merge main
- [ ] **GA4 App connect**: add service account `ais-gemini-key-88b236e5f62d4cf@612144486106.iam.gserviceaccount.com` Viewer vào property `465150028` (Firebase Console → Project Settings → Integrations → GA → Manage → Property Access Management) → thêm entry `gohub-app` vào `app_settings.ga4_configs` Supabase

**s158 — đã làm (2026-08-22):**
- ✅ **Tổ Gấu — fix toàn diện** (25a8129→da0a197):
  - Smart scroll: không auto-jump khi user đang đọc lịch sử; badge "N tin mới ↓" khi realtime có tin
  - Load more: nút "Tải thêm tin cũ" + cursor pagination `?before=<uuid>` + preserve scroll position
  - N+1 query → 2 batch queries; sort groups theo last activity
  - ConfirmModal + useConfirm hook thay toàn bộ `confirm()` native (DocsPanel, NotesPanel, SettingsModal, handleRecall)
  - Textarea auto-resize; @mention keyboard nav (ArrowUp/Down); Manager badge sidebar
  - Search click miss → toast hướng dẫn
- ✅ **Wiki 3-tier + KB tab Tổ Gấu** (c2d147c):
  - Rewrite 3HK, WM, Vendor-Priority theo format tư vấn CS (TL;DR, Q&A, script copy-paste)
  - Frontmatter mới: `audience`/`visibility`/`last_edited_by`/`last_edited_at` trên 12 files
  - API `/api/to-gau/kb`: browse/search/PATCH (edit tracking không cần migration)
  - AI Gấu Tổ inject KB context trước khi gọi Gemini
  - Tab 📚 Wiki trong Tổ Gấu: 2-pane, search, filter, render markdown, edit mode

**➡️ TIẾP THEO s158:** Chạy `python backend/seeding/import/import_wiki.py` để sync wiki mới lên Supabase KB. Cấp quyền GA4 App cho service account.

**s157 — đã làm (2026-08-21):**
- ✅ **fix Daily Report revenue lệch Dashboard** (ca712c5→82d7347, `lib/scheduled-report-data.ts`):
  - Root cause: 5 query revenue thiếu filter `SHIPPINGFEE0` + `INTERNAL-TRANSACTION`.
  - Fix lần 1: thêm `STD_FILTER` = `shipFilter` + `internalOpsFilterByCode` → timeout (NOT IN subquery chậm + cache cold → 8 query đồng thời vượt pool max=3).
  - Fix lần 2: đổi sang `s.group_name` alias (không subquery) + serialize gohub_dw queries (2/lần) theo thứ tự nhẹ→nặng.
- ✅ **Squad Progress — CM1 thực thay GP** (ee1c095→b2bff89, `api/analytics/squad-progress/route.ts`):
  - GP → CM1 = GP − chi phí KH (`b2b_customer_cost_monthly` Turso).
  - Đồng bộ logic với quarterly-report Overview: `buildQuarterMonthMeta` per-month factor, `SHIPPINGFEE0` filter, `fetchQuarterlySettings()` dynamic excluded customers.
  - Risk level: cập nhật comment 5 mức (rất AT/AT/AT Ít/NH Ít/NH Nhiều).
  - FE: nhãn GP→CM1, thêm %CM1 + %TGT CM1 squad card, bảng KH, total row, Excel export.
- ✅ **Quarter Report — thêm 3HK Revenue (số) bên cạnh 3HK%** (71edf3c→b2bff89):
  - 12 vị trí: KPI card · monthly table · total row · MonthSubRow · QtSummaryRow · Squad card/table/total · B2B customer row · B2B per-month · tier total · sub-row.
  - API quarterly-b2b-customers: thêm `hk3Rev` vào monthly data, `totalHk3Rev` vào tier totals.

**s156 — đã làm (2026-08-20/21):**
- ✅ **Quarter Report — UI/UX polish toàn bộ** (→ main 0ff2e62, `quarterly/page.tsx`):
  - **Squad Progress** S1–S5: admin toolbar compact · squad card progress bar · filter 1 tầng dropdown · customer table 9 cột · flat view banner · Export Excel (2 sheet). Bug fix: pct shadow, expandedSquads reset, total row GP PR.
  - **Overview** O1–O3: target card collapsible · monthly table toggle B2B/B2C · skeleton loading.
- ✅ **Web Analytics — App platform toggle** (main 8169cb1): toggle Web/App ở header; App → GA4 filter `platform=ios|android` thay `hostName`; ẩn GSC section khi App.
- ✅ **B2C — subtab Metric** (main 8169cb1): bảng YTD monthly Revenue/GP/CM1/Orders/AOV/Traffic/User/Customer với Web+App breakdown, %MoM badge.
- ✅ **fix Daily Report revenue + query timeout** (ebd6ac8): thêm filter SHIPPINGFEE0 + INTERNAL-TRANSACTION; dùng alias `s.group_name` thay NOT IN subquery để tránh timeout; serialize gohub_dw queries.

**s155 — đã làm (2026-08-19):**
- ✅ **Wave 1.2** Cà Thread multi-group (main): selector tabs, thêm/sửa/xóa group, backward-compat.
- ✅ **Wave 2.1** Tab Visibility bulk toggle + preview modal (main).
- ✅ **Wave 2.2** Access Audit Log + autocomplete username — v41 migration, gp-access/my-metrics-access ghi log (main).
- ✅ **Wave 2.3** Knowledge Search + Import batch Excel/CSV (main).
- ✅ **Wave 3** Usage compare kỳ trước · DevTools saved queries/history · cron ca-thread-remind (main).
- ✅ **C2** Product Win Rate: JOIN dim_sku lấy vendor thực + win_deadline + export Excel (main).
- ✅ **D1** Tests be-gau.ts (24/24 PASS) · **D3** Gấu Pro 6 image style presets (main).
- ✅ **Quarter Report — subtab Squad Progress** (main 0ff2e62): cấu hình squad · progress table Rev/GP~CM1/3HK · risk per-customer · filter + sort · target squad theo quý.

**s153 — đã làm (2026-08-18):**
- ✅ **Quarter Report — fix save target không được** (→ main b15b354)
  - `quarterly-targets` API: check `session.user.role` trực tiếp trước `canWriteTab` → tránh 403 khi getDbRole fail
  - `b2b-customer-targets` API: `Math.round()` target_rev/target_3hk_rev trước khi upsert BIGINT (lỗi `invalid input syntax for type bigint`)
  - `b2b-customer-targets` API: fallback upsert không có cột mới nếu migration chưa chạy (error 42703)
  - FE `saveTarget`: parseFmt vào trong try-catch + null-safe `?? ""`
- ✅ **Quarter Report — thu hẹp bảng KH để screenshot** (px-3→px-1.5, header 9px)

**s152 — đã làm (2026-08-18):**
- ✅ **Cà Thread — fix bugs** (ms timestamp, pagination, emoji field path, sort DESC)
- ✅ **Quarter Report — cột Target 3HK Revenue + %TGT 3HK + nhập tay** (migration v39)

**s151 — đã làm (2026-08-18):**
- ✅ **Cà Thread — gộp Dry-run/Live → Quét & Cà từng thread**
- ✅ **Quarter Report — CH.Cost B2B tier fix** (projected thay actual, cộng T9 ước tính)
- ✅ **Quarter Report — Target Revenue per-customer** (migration v38)
- ✅ **Áp dụng .ai skill**: staging-first pipeline, wiki sync, session log

**s150 — đã làm (2026-08-17):**
- ✅ **Cà Thread Lark** (`/analytics/creator`): bot quét group Lark, tag người trong thread chưa có reaction YES kèm "Dạ thread này còn update thêm thông tin gì nữa không ạ a/c"
- ✅ **OAuth Lark fix**: dùng `NEXTAUTH_URL` làm base, `sameSite: "none"` khi production
- ✅ **My Metrics — phân quyền**: chỉ creator + whitelist mới thấy tab

**s149 — đã làm (2026-08-17):**
- ✅ **B2B Tier Performance export**: đổi CSV → Excel, gộp strategic + all tiers, thêm cột Tier (commit 1bc594d → merge main)
- ⚠️ **BC Datapool**: xác nhận code hoàn chỉnh, thử 5 variant MD5 signature đều trả `[1008]` → AppSecret `082746f265c6412da554855fe415785a` SAI, chờ Hiếu lấy secret đúng từ BC support

**s148 — đã làm (2026-08-14):**
- ✅ **BC Datapool integration**: tab `/analytics/bc-datapool` (Product group), sync cron 7h ICT, tra cứu F011/F012/F023/F046, debug endpoint `/api/bc/debug`
- ✅ **Staff tab — 3HK Target tách Strategic/Non-Strategic**: migration v37, update API + page
- ✅ **Staff tab — fix button Sửa**: chỉ hiện với role có quyền (admin/creator/manager/bod + explicit grant); fix bug input chỉ nhập 1 số; cảnh báo số âm/không hợp lệ

**⚠️ BC Datapool — ĐANG BỊ CHẶN (cần Hiếu xử lý):**
- Channel ID: `GohubDataPool` ✅ (BC tìm thấy)
- AppSecret hiện tại `082746f265c6412da554855fe415785a` ❌ → BC luôn trả `[1008] Signature verification failed`
- Đã debug kỹ: formula `md5(appSecret + jsonBody)` đúng theo spec, nhưng secret sai
- **Việc cần làm**: Liên hệ BC support, hỏi: *"AppSecret `082746f265c6412da554855fe415785a` cho channel GohubDataPool có đúng không? Vui lòng xác nhận hoặc cung cấp secret đúng + 1 working example request."*
- Sau khi có secret đúng: cập nhật `BC_DATAPOOL_APP_SECRET` trên Vercel → bấm "Sync ngay" trên tab BC Datapool → test bằng "Test App Secret" trên tab Tra cứu

**s147 — đã xong (ghi lại):**
- ✅ Ẩn tab Tổ Gấu · Staff target · Inventory Management · Quarter Report · Quyền chỉnh sửa · My Metrics

**Ghi chú:**
- Quarter Report: target CM1 KH nhập là target QUÝ (không nhân × 3).
- Daily 【3】 theo QUÝ; nếu hiện "Chưa nhập target quý" → Hiếu nhập ở tab Quarter Report.
- Bé Gấu: Lark slow (skip — giới hạn kiến trúc)

---

## Đọc theo thứ tự khi bắt đầu session mới

1. **CLAUDE.md** (file này) — trạng thái + rules
2. **`new_info.txt`** — tick ✅ items chưa xong
3. **`docs/ERRORS.md`** — lỗi hay gặp, đọc để tránh lặp lại
4. **`docs/SYSTEM.md`** — khi cần biết file nào làm gì, DB schema, tab nào route nào
5. **`Bug.txt`** — khi user báo có bug
6. **`docs/CHANGELOG.md`** — khi cần context lịch sử s130+

---

## Rules bắt buộc

1. **Staging-first** — mọi thay đổi lên `staging`. KHÔNG push thẳng `main`.
2. **KHÔNG tự merge** staging → main dù staging PASS, chờ Hiếu yêu cầu rõ ràng.
3. **UI Strict Lock** — không đổi màu/bố cục/font/chart analytics mà không có chỉ thị từ Hiếu/Bảo.
4. **Wiki sync** — sửa tab nào → cập nhật `docs/wiki/Tab/<tên-tab>.md` ngay cùng lần.
5. **Commit + push sau mỗi task** — không batch nhiều task thành 1 commit lớn.
6. **tsc trước khi push** — `npx.cmd tsc --noEmit` (PowerShell, không phải `npx tsc`).

---

## Coding rules

- Minimum code giải quyết đúng vấn đề — không thêm abstraction/feature ngoài yêu cầu.
- Chỉ touch những gì cần — không refactor code không liên quan.
- Không comment giải thích "what" — chỉ comment "why" khi thật sự không rõ.
- Tự test/fix/push, chỉ hỏi khi thao tác web hoặc chưa rõ ý tưởng.
- Mọi lỗi UI hiện: "Hiếu đang fix, vui lòng đợi".

---

## Ghi tài liệu

| Nội dung | File đích |
|---|---|
| Lỗi gặp + cách fix + lesson learned | `docs/ERRORS.md` |
| Lịch sử session / thay đổi lớn | `docs/CHANGELOG.md` |
| Bug tracker (danh sách thô) | `Bug.txt` |
| Session log chi tiết | `docs/session_summary.txt` (append) |
| Kiến trúc hệ thống | `docs/SYSTEM.md` |
| Wiki từng tab | `docs/wiki/Tab/<tên-tab>.md` |
| Audit số analytics | `docs/AUDIT_ANALYTICS.md` (local, gitignored) |
| Agent/prompt changes | `.ai/agents/AGENTS.md` |

---

## Stack nhanh

- **Next.js 14** App Router · **Vercel** · **Supabase** (products/KB/config) · **gohub_dw** GCP Postgres (analytics, read-only) · **Turso** (b2b costs, config)
- Analytics DB: Hiếu không có quyền DDL trên gohub_dw
- Vercel env: `TURSO_URL`, `TURSO_AUTH_TOKEN`, `SUPABASE_SERVICE_KEY`, `CRON_SECRET`, `ANALYTICS_DB_*` (phải tick scope Preview)
- Chatbot chính: **Bé Gấu** (`be-gau.ts`, single function-calling agent, s131+) — pipeline 6-agent cũ = legacy
- Creator AI: **Gấu Pro** (`creator-ai.ts`, 16+ tools, Wave 1: trend + image gen)
- FE design: xem `.ai/FESkill.md`
- Coding rules chi tiết: `.ai/CLAUDE.md`
