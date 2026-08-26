# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.

---

## Trạng thái hiện tại (2026-08-26, s162)

| | |
|---|---|
| Branch làm việc | `staging` (làm việc ở đây, merge main **CHỈ khi Hiếu yêu cầu RÕ RÀNG** trong chính tin nhắn đó) |
| tsc | PASS |
| ⏳ Trên staging CHƯA merge main | s161 (881e436, a358c70) + s162: B2B CM1 cost-model audit + fix (ea2296b, 921cf9c) |
| ✅ Đã lên main | s159 security hardening + s160 Squad Progress risk-level fix + UI redesign (đến dacc99d) |

**➡️ TIẾP THEO (2026-08-26+):**
- **QA số liệu s162 (QUAN TRỌNG, làm trước khi merge main)**: Claude chưa verify được B2B CM1 fix bằng live gohub_dw (máy dev thiếu `ANALYTICS_DB_*`). Hiếu tự chạy dev/staging, so B2B CM1 giữa BOD/Channels/Dashboard/B2B tab trước và sau fix — số sẽ THẤP HƠN ở các tab đó (nay trừ thêm Turso B2B cost). Đặc biệt **BOD tab** (leadership xem) — báo Claude nếu số lệch không hợp lý.
- ✅ **Inventory tab — đã seed xong (2026-08-26)**: chạy `import_inventory_plan.mjs` thành công (Supabase creds Hiếu gửi qua `tmp.txt` — SUPABASE_SECRET_KEY định dạng mới `sb_secret_...`, map vào `SUPABASE_SERVICE_KEY`). Kết quả: `inventory_plan_skus` 12 dòng (9 VN+3 US) · `inventory_plan_weekly` 276 dòng · `inventory_po` 9 dòng — khớp Excel. Fix kèm: `parseUsDate` trong script không nhận diện được ngày DD/MM lẫn trong sheet PO (Ops nhập tay lẫn 2 format) → sửa tự nhận diện khi 1 số >12; 4 dòng PO ngày AMBIGUOUS (cả 2 số ≤12) tạm lấy mặc định MM/DD, **cần Hiếu soát tay trong Supabase `inventory_po`**: `1ETHATMF01507`/`AB0003DK00000`/`1D0003DK00000`/`ACTHATMF05010` (chi tiết hỏi Claude nếu quên). Còn lại: QA trực quan tab `/analytics/fulfillment` (đã đổi nội dung, giữ URL) trên staging trước khi merge main.
- **Scheduled Messages**: theo dõi vài ngày xem còn timeout/Lark alert lỗi không (đã fix s161, nâng maxDuration 60→180s + soft-timeout + alert).
- Hiếu cấp quyền GA4 App cho service account → test toggle App trong Web Analytics. Xem lại UI Squad Progress trên production, báo nếu cần chỉnh.

**s162 — đã làm (2026-08-26):**
- ✅ **Fix Squad Progress thiếu Group Cost B2B** (`api/analytics/squad-progress/route.ts`, commit ea2296b): CM1 Squad Progress chỉ trừ chi phí per-customer (Turso), thiếu trừ Group Cost B2B (Supabase `analytics_channel_group_costs`) mà Tổng quan (`quarterly-report`) + tier (`quarterly-b2b-customers`) đều trừ → CM1 cao hơn Tổng quan có hệ thống. Áp lại công thức phân bổ theo revenue-share y hệt route tier (#4 NHẤT QUÁN GROUP COST), trừ ở cả mức Actual và PR, chỉ ở mức squad/tổng (từng customer giữ nguyên).
- ✅ **Audit + fix B2B CM1 toàn hệ thống — 3 "thế hệ" cost model chạy song song** (commit 921cf9c): phát hiện B2B cost thật (Ops nhập qua Turso `b2b_customer_cost_monthly`, tab Quarter Report) KHÔNG được các route sau biết tới, chúng chỉ trừ `analytics_channel_costs` Supabase (gần như luôn rỗng cho B2B) hoặc chỉ group cost → CM1 B2B cao ảo, khác Quarter Report/B2B-detail-table cùng kỳ dù "code theo OOP dùng chung `cost-engine.ts`" (OOP chỉ chung CÔNG THỨC 1 dòng cost, KHÔNG chung việc chọn NGUỒN cost — đây là root cause thật). Đồng bộ Turso cho: `b2b/kpis` (KPI card đầu tab B2B — trước khác cả với bảng chi tiết CÙNG TAB), `b2b/trend`, `channels/kpis`, `channels/performance`, `monthly-kpis` (Dashboard), **cron `refresh-monthly-kpis`** (snapshot Bé Gấu dùng trả lời câu hỏi CM1 theo tháng — TRƯỚC FIX CHATBOT TRẢ LỜI SAI SỐ CM1), `bod-data.ts` (`fetchBODGroupMarginData`/`fetchBODChannelPerformanceData`/`fetchBODReportData` → cả 4 route BOD), `all-time-performance`. B2C/Other giữ nguyên channel cost Supabase (đúng, không đổi).
  - ⚠️ **Biết trước, CHƯA fix**: Dashboard/`monthly-kpis` vẫn thiếu channel-level cost cho B2C (chỉ group cost) — khác Channels/B2B tab đã có. `all-time-performance` có bug tồn tại từ trước (query chính thiếu `JOIN dim_customer c` dù CASE tham chiếu `c.price_list_name` — chỉ không lỗi khi tier keywords rỗng) — cần Hiếu xác nhận trước khi sửa riêng.
  - **KHÔNG verify được bằng live query** — máy dev Claude không cầm được secret thật (`.env.local` bị harness sandbox redact thành literal `"[SENSITIVE]"` ngay khi Claude/bất kỳ process nào trong session này chạm tới file, kể cả sau khi Hiếu tự `vercel env pull` — thử 2 lần đều vậy). Toàn bộ fix dựa trên đọc code + đối chiếu công thức, **Hiếu cần tự QA số trên staging** trước merge main.
  - Wiki cập nhật: `analytics-b2b.md`, `analytics-bod.md`, `analytics-channels.md`, `analytics-dashboard.md`, `analytics-all-time.md`, `analytics-quarterly.md`.

**s161 — đã làm (2026-08-25):**
- ✅ **Fix Scheduled Messages không tự gửi** (`api/cron/scheduled-messages/route.ts`, commit 881e436): root cause — Daily report (nặng nhất, ~6 batch query gohub_dw tuần tự + Gemini + Lark) vượt `maxDuration=60s` cũ → Vercel kill giữa chừng SAU khi atomic claim đã ghi `last_run_at` nhưng TRƯỚC khi gửi Lark → slot bị đánh dấu "đã chạy" dù tin chưa từng tới, lặp lại mỗi ngày, không alert (khớp đúng triệu chứng: cron-job.org báo timeout ~30s, Lark im lặng hoàn toàn). Fix: `maxDuration` 60→180 (cron + nút Test ngay), soft-timeout guard bailout chủ động ở 160s, chia ngân sách khi nhiều message đến hạn cùng lúc, **thêm Lark alert khi 1 message thất bại** (trước chỉ alert lỗi đọc danh sách đầu route).
- ✅ **Tab Inventory thay hoàn toàn Fulfillment cũ** (commit a358c70, theo yêu cầu Hiếu dựa trên `Plan nhập hàng theo tháng.xlsx` Ops dùng): bỏ hẳn theo dõi tồn kho theo kho vật lý PQ/DD/TSN + vendor balance (s147) → thay bằng **dự phóng tồn kho theo tuần từng SKU (VN/US)** + **PO tracker**. Route/permission giữ nguyên `/analytics/fulfillment` (id `"fulfillment"`), chỉ đổi nhãn hiển thị "Fulfillment"→"Inventory".
  - Migration `v42_inventory_plan.sql`: `inventory_plan_skus` (watchlist) + `inventory_plan_weekly` (actual_stock/sales_forecast/import_qty theo tuần, `*_auto` đánh dấu OPS đã ghi đè) + `inventory_po` (thay sheet PO Dự kiến nhập). **Hiếu đã chạy migration trên Supabase.**
  - Gợi ý tự động (`lib/inventory-plan.ts`): Bán dự kiến từ vận tốc bán 30 ngày (`gohub_dw`), Số nhập theo rule reorder-to-target khi tồn dự phóng dưới ngưỡng an toàn — OPS ghi đè thì giữ nguyên, không bị tính lại đè lên.
  - `actual_stock` (tồn thực tế) **chưa có nguồn `gohub_dw`** — OPS nhập tay tạm, Hiếu sẽ báo cột khi tech bổ sung để nối tự động.
  - `scripts/import_inventory_plan.mjs`: import 1 lần dữ liệu Excel hiện có — **CHỜ Hiếu chạy** (máy dev không có `.env.local`).
  - Wiki `docs/wiki/Tab/analytics-fulfillment.md` viết lại toàn bộ.
- ✅ **Cài skill `caveman`** (plugin marketplace `JuliusBrussee/caveman`, scope user) — chế độ trả lời tối giản token, active mặc định toàn máy theo yêu cầu Hiếu. Không liên quan trực tiếp code GoHub, ghi chú lại để nhớ nguồn nếu cần gỡ (`claude plugin uninstall caveman@caveman`, hoặc `/caveman off` tắt tạm 1 phiên).

**s160 — đã làm (2026-08-25):**
- ✅ **Squad Progress — fix logic đánh giá risk** (`api/analytics/squad-progress/route.ts`, commit d7d9218): `getRiskLevel` đổi sang **ưu tiên mức xấu nhất** — trước đây 1 trong 2 metric (CM1%/3HK%) ≥100% là đủ để lên "An toàn" dù metric còn lại rất thấp (case thật: ShopeePaySG CM1 50%/3HK 106% bị gắn nhầm "An toàn"). Nay chỉ cần 1 metric <85% là kéo cả cặp xuống nhóm nguy hiểm. Cập nhật `docs/wiki/Tab/analytics-quarterly.md` khớp logic mới.
- ✅ **Squad Progress — redesign UI** (commit cea6214, chỉ UI không đổi logic/công thức): badge đánh giá dot+màu rõ hơn + legend dùng chung; 3 stat tile Doanh thu/CM1/3HK thay dòng text dồn cục (số PR trọng tâm, tile tự viền đỏ khi %TGT <85%); dải màu risk bên trái mỗi dòng squad/KH để quét nhanh; footer "Tổng" thành thanh tóm tắt nền brand blue.
- ⚠️ **Máy dev (D:\gohub) chưa có `web/.env.local`** → không chạy được dev server live để test UI trực tiếp; đã tsc PASS + dựng preview tĩnh minh hoạ bằng số liệu thật để tự kiểm tra bố cục trước khi merge.

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
- [x] ✅ **v42 `inventory_plan_skus/inventory_plan_weekly/inventory_po`** (tab Inventory, s161 — Hiếu đã chạy)
- [x] ✅ ENV Vercel: `BC_DATAPOOL_*` · `LARK_CREATOR_USER_ID`

**Hiếu cần làm (còn lại, s159+):**
- [x] ✅ **Vercel env**: `LARK_VERIFICATION_TOKEN` đã set Production + Preview
- [x] ✅ **Vercel env**: `ANALYTICS_DB_HOST` / `ANALYTICS_DB_NAME` / `ANALYTICS_DB_USER` đã xác nhận
- [ ] **Inventory tab**: chạy `node scripts/import_inventory_plan.mjs "D:\gohub\Plan nhập hàng theo tháng.xlsx"` (trong `web/`, máy có `.env.local`) để seed dữ liệu Excel, gửi output kiểm tra khớp.

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

> ⚠️ **Multi-machine**: `Bug.txt`, `new_info.txt`, `docs/ERRORS.md`, `docs/SYSTEM.md`, `docs/CHANGELOG.md` bị **gitignore** (local-only trên máy gốc của Hiếu, KHÔNG sync qua git — xem commit `4b47996` "docs chỉ commit wiki — gỡ internal docs khỏi remote"). Trên máy mới clone/checkout, các file này **có thể không tồn tại** — bình thường, không phải lỗi, đừng báo "thiếu file". Dùng bước 2–3 dưới đây làm nguồn thay thế đầy đủ.

1. **CLAUDE.md** (file này) — trạng thái + rules
2. **`docs/session_summary.txt`** — log chi tiết từng session (nếu có trên máy) — context lịch sử, thay `docs/CHANGELOG.md`. Đọc từ cuối file lên (session mới nhất trước).
3. **`docs/wiki/`** (45 file, **git-tracked, LUÔN có** trên mọi máy) — nguồn tham chiếu đầy đủ nhất, đọc hết 1 lần đầu session (hoặc khi được yêu cầu "đọc hệ thống"):
   - `docs/wiki/system/*.md` — kiến trúc hệ thống, chatbot 7-agent + Guardian, Operations Runbook (thay `docs/SYSTEM.md`)
   - `docs/wiki/Tab/_analytics-data-model.md` — đọc TRƯỚC mọi tab analytics khác (bảng fact/dim, `getAnalyticsSource`, filter chuẩn dùng chung)
   - `docs/wiki/Tab/*.md` — 1 file/tab web: mục đích · luồng data · API · công thức · **Gotchas** (mỗi tab có mục riêng — dùng thay `docs/ERRORS.md` khi file đó vắng mặt)
   - `docs/wiki/company|pricing|products|vendors|processes/*.md` — nghiệp vụ (mã SKU/Item, COGS 3HK, vendor priority, combo chuẩn, import NCC...)
4. **`new_info.txt`** (nếu có) — tick ✅ items chưa xong
5. **`docs/ERRORS.md`** (nếu có) — lỗi hay gặp; nếu KHÔNG có trên máy → tra mục "Gotchas"/"Vấn đề đã gặp" trong `docs/wiki/Tab/*.md` hoặc log lỗi trong `docs/session_summary.txt`
6. **`Bug.txt`** (nếu có) — khi user báo có bug

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
