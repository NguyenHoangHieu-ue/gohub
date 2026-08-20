# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.

---

## Trạng thái hiện tại (2026-08-20, s156)

| | |
|---|---|
| Branch làm việc | `staging` (làm việc ở đây, merge main **CHỈ khi Hiếu yêu cầu RÕ RÀNG** trong chính tin nhắn đó) |
| tsc | PASS |
| ⏳ Trên staging CHƯA merge main | (clean — s155+s156 đã merge main 8169cb1) |
| ✅ Đã lên main | Wave 1+2+3 + C2/D1/D3 + Squad Progress + Web Analytics App toggle + B2C Metric subtab (đến 8169cb1) |

**➡️ TIẾP THEO:** Hiếu cấp quyền GA4 App cho service account → test toggle App trong Web Analytics.

**⚠️ QUY TẮC MERGE (nhắc lại):** KHÔNG tự merge main. "tiếp tục"/"làm tiếp" = chỉ push staging. Chỉ merge khi Hiếu nói "merge main" trong CHÍNH tin đó.

**Migrations & ENV — đã xong:**
- [x] ✅ v31–v35 (cũ) · v36 BC Datapool · v37 staff hk3 split
- [x] ✅ v38 `target_rev` + v39 `target_3hk_rev` trên `b2b_customer_targets`
- [x] ✅ **v40 `ca_thread_log`** (lịch sử cà thread)
- [x] ✅ **v41 `access_audit_log`** (audit log cấp quyền)
- [x] ✅ ENV Vercel: `BC_DATAPOOL_*` · `LARK_CREATOR_USER_ID`

**Hiếu cần làm (còn lại):**
- [ ] Liên hệ DB owner gohub_dw cho Looker Studio / Power BI
- [ ] **Portal Affiliate**: nhập App ID + Secret Shopee Affiliate Open API
- [ ] **BC Datapool — lấy appSecret đúng từ BC support**
- [ ] **Cà Thread**: thêm bot Bé Gấu vào group Lark + bật scope `im:message` & `im:message.reaction:readonly` + publish version mới
- [ ] **Cà Thread**: Kết nối Lark cá nhân (Creator page → Kết nối Lark)
- [ ] **Test Wave 1.1** trên staging: cà 1 thread → reload → còn badge "Đã cà" + section Lịch sử → nếu OK → merge main

**s156 — đã làm (2026-08-20):**
- ✅ **Web Analytics — App platform toggle**: toggle Web/App ở header; App → GA4 filter `platform=ios|android` thay `hostName`; ẩn GSC section khi App. `lib/ga4.ts` + `api/analytics/ga4/route.ts` + `analytics/website/page.tsx` (main 8169cb1).
- ✅ **B2C — subtab Metric**: bảng YTD monthly Revenue/GP/CM1/Orders/AOV/Traffic/User/Customer với Web+App breakdown, %MoM badge. API `/api/analytics/b2c/metric` + component `b2c-metric.tsx` (main 8169cb1).
- ⏳ **GA4 App connect** (Hiếu cần làm): property ID = `465150028` (Firebase Analytics GoHub App). Service account `ais-gemini-key-88b236e5f62d4cf@612144486106.iam.gserviceaccount.com` cần được add Viewer vào property này (Firebase Console → Project Settings → Integrations → GA → Manage → Property Access Management). Sau đó thêm entry `gohub-app` vào `app_settings.ga4_configs` trong Supabase.

**s155 — đã làm (2026-08-19):**
- ✅ **Wave 1.2** Cà Thread multi-group (main): selector tabs, thêm/sửa/xóa group, backward-compat.
- ✅ **Wave 2.1** Tab Visibility bulk toggle + preview modal (main).
- ✅ **Wave 2.2** Access Audit Log + autocomplete username — v41 migration, gp-access/my-metrics-access ghi log (main).
- ✅ **Wave 2.3** Knowledge Search + Import batch Excel/CSV (main).
- ✅ **Wave 3** Usage compare kỳ trước · DevTools saved queries/history · cron ca-thread-remind (main).
- ✅ **C2** Product Win Rate: JOIN dim_sku lấy vendor thực + win_deadline + export Excel (main).
- ✅ **D1** Tests be-gau.ts (24/24 PASS) · **D3** Gấu Pro 6 image style presets (main).
- ✅ **Quarter Report — subtab Squad Progress** (staging, chưa merge): cấu hình squad (tên+leader từ users+sales_pics click-only, pic đã chọn biến khỏi list) · progress table Rev/GP~CM1/3HK Actual/PR/Target/% · **đánh giá risk per-customer** (very_safe/safe/safe_low/danger_low/danger_high theo %TGT CM1 & %TGT 3HK) · filter (search KH/region VN-US/tier/squad/PIC chips/risk chips) + sort + flat-view khi có filter · nhập **target squad theo quý** (Rev/CM1/3HK Rev → `app_settings.squad_targets` keyed `{Q}_{year}`, ưu tiên hơn tổng per-customer).
  - Bug đã fix: PUT→POST (405), auth JWT role thay getDbRole, GROUP BY thiếu price_list_name/currency_code.

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
