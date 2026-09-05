# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.
> Lịch sử chi tiết từng session nằm ở `docs/session_summary.txt` (đọc từ cuối lên) — file này CHỈ giữ
> trạng thái hiện tại + rule + checklist việc còn phải làm, không giữ narrative cũ (rút gọn s189 2026-09-05).

---

## Trạng thái hiện tại (2026-09-05, s191)

| | |
|---|---|
| Branch làm việc | `staging` (làm việc ở đây, merge main **CHỈ khi Hiếu yêu cầu RÕ RÀNG** trong chính tin nhắn đó) |
| tsc + `next build` + `next lint` | PASS (lint: 0 error, 193 warning — xem `web/.eslintrc.json`) |
| ✅ **s191 (2026-09-05) — nâng cấp cache + Đợt 1 redesign UI (3 tab thí điểm)** | Theo yêu cầu Hiếu "UI đẹp/chuyên nghiệp hơn cho mọi tab + sửa cache hay lỗi". Kế hoạch đầy đủ: `C:\Users\nhhie\.claude\plans\eager-popping-aho.md` (đã duyệt qua EnterPlanMode, làm theo đợt). **Đợt 1 — cache**: thay `B2B_COST_CACHE_PREFIXES` (prefix-list viết tay, gây ≥3 sự cố lịch sử s168b/s169/s169(c)) bằng `deps` khai NGAY tại chỗ `cachedQuery()` — `flushByDeps(["b2b-cost"])` xoá theo chủ đề thay vì phải nhớ danh sách route. Migration `v47_cache_deps.sql` (thêm cột `deps text[]` + GIN index vào `analytics_query_cache` — Hiếu đã chạy). Audit trước khi sửa: KHÔNG có bug cache-stale nào đang sống, đây là nâng cấp phòng ngừa. **Đợt 2 — bộ giao diện dùng chung**: hoàn thiện `dashboard-kit.tsx` (vốn có sẵn nhưng chỉ 3/32 trang dùng) — `StatTile` (thẻ KPI, màu icon theo Ý NGHĨA số liệu thay vì ngẫu nhiên), `DataTable` (port từ my-metrics, tổng quát cho mọi trang), theme chart dùng chung. **Đợt 3 — rollout thí điểm 3 tab quan trọng nhất** (đã QA qua Chrome trên staging, số liệu y hệt bản cũ): BOD Report (8 card → StatTile), Dashboard (4 KPI đầu trang → StatTile), Quarter Report (sửa hex xanh navy tự đoán sai `#003B95` → `brand-600` thật `#0f4c81`, cùng lỗi đã fix ở my-metrics-charts s167 nhưng chưa ai sửa ở đây — 87+ chỗ). **CHƯA làm**: các tab còn lại (Channels/B2B/B2C rồi tới Website/Staff/Customers/Vendors rồi tới phần còn lại — xem plan file mục "Đợt 4+" để biết thứ tự lô), trong đó Channels + `creator/usage` cũng đang dính CÙNG lỗi hex `#003B95` (chưa sửa, để dành đúng lô của nó). |
| Plan đang chạy | Rebuild toàn diện theo `C:\Users\nhhie\.claude\plans\effervescent-zooming-wilkinson.md` (Hiếu đã duyệt) — Phase 0-6, mỗi phase 1 lần xin xác nhận riêng trước khi merge main. Phase 0-6 đều đã làm xong tách cơ học/hạ tầng (xem session_summary.txt s183-s189); merge main CHƯA xin. |
| ✅ **s190 (2026-09-05) — audit toàn diện + 2 fix thật phát hiện qua audit** | Theo yêu cầu Hiếu "đánh giá toàn diện quy trình/hệ thống/code/OOP/security/UI-UX". Report đầy đủ (21 phát hiện, ưu/nhược + hướng sửa) đã publish Artifact cho Hiếu, không lưu file trong repo. 2 fix đã làm ngay trong lúc audit: (1) **`creator-ai.ts` 2060→750 dòng** — xoá 3 khối code chết cộng dồn 63% file (declarations cũ + implementation cũ của executeSQL/querySupabase/browsePortal/generateImage/... + nguyên khối `if (false) await Promise.all(...)`), tất cả đã bị thay thế hoàn toàn bởi `creator/declarations.ts` + `creator/tools/dispatch.ts` từ trước, không đổi hành vi (giữ nguyên `runReadKnowledgeBase` vì be-gau.ts còn import trực tiếp). (2) **`guardian.ts` — xoá cơ chế policy DB mồ côi**: Hiếu tự kiểm tra Supabase thấy `app_settings.access_policy` còn dữ liệu CŨ đang deny margin_cogs/staff_hr/customer_pii/system_internal cho staff/b2b/b2c/saleb2c/ops-&-cs/product — route UI ghi policy đã xoá từ lúc gộp Bé Gấu/Gấu Pro nhưng `guardCheck()` vẫn đọc override này mỗi request, âm thầm trái với chủ trương "ai cũng như nhau" đã chốt, không ai biết vì hết UI hiển thị. Đã xoá route `/api/config/access-policy` + toàn bộ `loadPolicy`/cache/`DEFAULT_POLICY` dept-branch trong guardian.ts — quyết định giờ cứng trong code, không còn "cấu hình ẩn" nào lệch khỏi ý định. `canViewCogs()` giờ luôn `true`. tsc+eslint+vitest (182/182) PASS cả 2 fix. Dòng cũ trong Supabase vẫn còn nhưng vô hại (code không đọc nữa) — Hiếu có thể tự `DELETE FROM app_settings WHERE key='access_policy'` cho gọn, không bắt buộc. |
| ✅ **Phase 6 (2026-09-05) — vá lỗ hổng quy trình** | Thêm script `lint` thật (`next lint`, trước đây không có dù docs mô tả có). Rule pragmatic cho codebase 285+ file chưa từng lint (no-explicit-any off, vài rule hạ warn) — xem `.eslintrc.json`. Fix 2 bug thật: eslint-disable-comment dùng "—" thay "--" nên không có tác dụng. GitHub Actions CI — Hiếu chọn KHÔNG setup, giữ quy trình tsc-tay. Smoke test route đã migrate — KHÔNG làm được (máy dev thiếu credential DB thật, route crash ngay khi import do client DB khởi tạo dùng env ở module-level). |
| ✅ **Phase 5 (2026-09-04/05) — dọn 4 trang FE khổng lồ, tách cơ học** | `quarterly/page.tsx` 3077→1564 dòng, `channels/page.tsx` 1944→1843, `to-gau/[id]/page.tsx` 2843→1224, `my-metrics/page.tsx` 1809→629. Nguyên tắc: CHỈ move nguyên khung JSX/logic, KHÔNG gộp khối JSX khác nhau (máy dev không có `.env.local` để verify UI bằng mắt, tsc là lưới an toàn duy nhất). QA Chrome thật xác nhận PASS cho quarterly Tổng quan + channels; **to-gau/My Metrics/B2BTierSection còn nợ Hiếu QA trên staging** (xem checklist dưới). |
| ✅ Phase 0-4 (2026-09-04) | Wiki tái cấu trúc `business/`+`system/` · engine `getKpiFactor`/`getElapsedRatio` + 30 test · fix bug thật All-Time + timezone date-math + migrate BOD/Quarter/B2B sang engine · dọn tàn dư Orders/Order Report · rate-limit Upstash Redis + mở rộng 4 route. Chi tiết: `docs/session_summary.txt` s183-s187. |
| 📌 **Ghi nhớ: Vercel Hobby plan = cron tối đa 1 lần/ngày/job** | Từng gây FAIL deploy ~2 tiếng (s167 đặt cron 3h/lần) — khi thêm cron mới, luôn set tối đa 1x/ngày. |
| 📌 **Ghi nhớ: máy dev KHÔNG có `web/.env.local`** | Không chạy được dev server / `next build` collect-page-data / query gohub_dw-Supabase thật. tsc + vitest (unit, mock DB) là lưới an toàn duy nhất chạy được tại chỗ — mọi thay đổi chạm DB/UI cần Hiếu tự QA trên staging. |

---

## Việc Hiếu cần làm (còn mở)

- [ ] **s191 — QA thị giác 3 tab vừa đổi UI trên staging** (BOD Report/Dashboard/Quarter Report — đã tự QA
  qua Chrome, số liệu khớp bản cũ, nhưng Hiếu nên tự xem 1 lượt trước khi làm tiếp lô tab kế) — xem plan
  `C:\Users\nhhie\.claude\plans\eager-popping-aho.md` để biết lô tiếp theo (Channels/B2B/B2C).
- [ ] **s190 audit — quyết định lại quyền `bod` cho sub-tab SQL Query** (Dev Tools): mất khi gộp SQL
  Explorer vào Dev Tools (vốn chỉ admin/creator) — nếu bod cần lại, báo để tách check quyền riêng.
- [ ] **s190 audit — (không gấp) dọn tay hàng `access_policy` trong Supabase** `app_settings` — code đã
  không đọc nữa (xem dòng s190 ở trên), xoá cho gọn hay để cũng không sao.
- [ ] **Phase 5 — QA UI to-gau + My Metrics + B2BTierSection trên staging** (tách cơ học mới nhất, CHƯA
  verify bằng Chrome): to-gau (`SettingsModal`/`DocsPanel`/`NotesPanel`/`WikiPanel`/upload file+ảnh/
  @mention/xoá tin) + My Metrics (`EvidenceCard`/`LarkReviewPanel`/`SkuScanSection`/
  `BegauInsightsSection`/`LarkConfigModal`/`DatapoolDetailTable`) + Quarter Report tab B2B
  (`B2BTierSection` — bảng tier, expand KH VN/US, sửa/import/export CH.Cost, target KH per-customer).
  Sau khi QA xong cả 4 file, Phase 5 coi như hoàn tất hẳn.
- [ ] **Phase 4 — tạo tài khoản Upstash Redis** (free tier) + set `UPSTASH_REDIS_REST_URL`/
  `UPSTASH_REDIS_REST_TOKEN` trên Vercel (Production + Preview) để rate-limit chặn thật cross-instance —
  chưa set vẫn chạy đúng như in-memory cũ, chỉ chưa có lợi ích cross-instance.
- [ ] **s173 — xác nhận đã Kết nối Lark cá nhân** (Creator Settings) + **bot đã add vào group Sales/PIC
  liên quan** — 2 điều kiện để bot My Metrics capture real-time hoạt động (Lark chỉ gửi event cho group
  bot LÀ THÀNH VIÊN, không tự động hoá được).
- [ ] **s163 — chạy migration `v43_kb_wiki_group_scope.sql`** trên Supabase nếu chưa (kiểm tra lại — có
  thể đã chạy, chưa xác nhận gần đây).
- [ ] Liên hệ DB owner gohub_dw cho Looker Studio / Power BI.
- [ ] **Portal Affiliate**: nhập App ID + Secret Shopee Affiliate Open API.
- [ ] **BC Datapool — lấy appSecret đúng từ BC support** (AppSecret hiện tại luôn trả `[1008] Signature
  verification failed`, formula đúng spec nhưng secret sai).
- [ ] **Cà Thread**: thêm bot Bé Gấu vào group Lark + bật scope `im:message` &
  `im:message.reaction:readonly` + publish version mới.
- [ ] **GA4 App connect**: add service account
  `ais-gemini-key-88b236e5f62d4cf@612144486106.iam.gserviceaccount.com` Viewer vào property `465150028`
  (Firebase Console → Project Settings → Integrations → GA → Manage → Property Access Management) → thêm
  entry `gohub-app` vào `app_settings.ga4_configs` Supabase.

**Ghi chú:**
- Quarter Report: target CM1 KH nhập là target QUÝ (không nhân × 3).
- Daily 【3】 theo QUÝ; nếu hiện "Chưa nhập target quý" → Hiếu nhập ở tab Quarter Report.
- Bé Gấu: Lark slow (skip — giới hạn kiến trúc).

---

## Migrations đã chạy (mốc gần nhất)

v31–v42 (cũ, xem session_summary.txt nếu cần chi tiết) · **v43** `kb_wiki_pages.visibility_mode` +
`kb_wiki_page_groups` (⚠️ xác nhận lại đã chạy chưa — xem checklist trên) · **v44**
`okr_evidence_records`/`okr_sku_tags` · **v45** `okr_lark_events` + nới `okr_sku_tags.effective_date` ·
**v46** `okr_lark_message_log` — tất cả v44-v46 Hiếu đã xác nhận chạy. · **v47** `analytics_query_cache.deps` (Hiếu đã xác nhận chạy 2026-09-05).

---

## Đọc theo thứ tự khi bắt đầu session mới

> ⚠️ **Multi-machine**: `Bug.txt`, `new_info.txt`, `docs/ERRORS.md`, `docs/SYSTEM.md`, `docs/CHANGELOG.md` bị **gitignore** (local-only trên máy gốc của Hiếu, KHÔNG sync qua git — xem commit `4b47996` "docs chỉ commit wiki — gỡ internal docs khỏi remote"). Trên máy mới clone/checkout, các file này **có thể không tồn tại** — bình thường, không phải lỗi, đừng báo "thiếu file". Dùng bước 2–3 dưới đây làm nguồn thay thế đầy đủ.

1. **CLAUDE.md** (file này) — trạng thái + rules
2. **`docs/session_summary.txt`** — log chi tiết từng session (nếu có trên máy) — context lịch sử, thay `docs/CHANGELOG.md`. Đọc từ cuối file lên (session mới nhất trước).
3. **`docs/wiki/`** (**git-tracked, LUÔN có** trên mọi máy, tái cấu trúc s183 2026-09-04 thành 2 khu
   `business/` + `system/`) — nguồn tham chiếu đầy đủ nhất, đọc hết 1 lần đầu session (hoặc khi được yêu
   cầu "đọc hệ thống"):
   - `docs/wiki/system/*.md` — kiến trúc hệ thống, chatbot 7-agent + Guardian, Operations Runbook, quy
     trình vận hành (thay `docs/SYSTEM.md`)
   - `docs/wiki/system/analytics-data-model.md` — đọc TRƯỚC mọi tab analytics khác (bảng fact/dim,
     `getAnalyticsSource`, filter chuẩn dùng chung)
   - `docs/wiki/system/tabs/*.md` — 1 file/tab web: mục đích · luồng data · API · công thức · **Gotchas**
     (mỗi tab có mục riêng — dùng thay `docs/ERRORS.md` khi file đó vắng mặt)
   - `docs/wiki/business/*.md` — nghiệp vụ dạng văn bản đọc (mã SKU/Item, COGS 3HK, vendor priority, combo
     chuẩn, import NCC...) — viết cho CS/Sale/Product, KHÔNG dùng bảng
4. **`new_info.txt`** (nếu có) — tick ✅ items chưa xong
5. **`docs/ERRORS.md`** (nếu có) — lỗi hay gặp; nếu KHÔNG có trên máy → tra mục "Gotchas"/"Vấn đề đã gặp" trong `docs/wiki/system/tabs/*.md` hoặc log lỗi trong `docs/session_summary.txt`
6. **`Bug.txt`** (nếu có) — khi user báo có bug

---

## Rules bắt buộc

1. **Staging-first** — mọi thay đổi lên `staging`. KHÔNG push thẳng `main`.
2. **KHÔNG tự merge** staging → main dù staging PASS, chờ Hiếu yêu cầu rõ ràng.
3. **UI Strict Lock** — không đổi màu/bố cục/font/chart analytics mà không có chỉ thị từ Hiếu/Bảo.
4. **Wiki sync** — sửa tab nào → cập nhật `docs/wiki/system/tabs/<tên-tab>.md` ngay cùng lần.
5. **Commit + push sau mỗi task** — không batch nhiều task thành 1 commit lớn.
6. **tsc trước khi push** — `npx.cmd tsc --noEmit` (PowerShell, không phải `npx tsc`). `npm run lint`
   (`next lint`, từ s189) cũng nên chạy — không chặn nhưng cảnh báo dead code thật.

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
| Wiki từng tab (kỹ thuật) | `docs/wiki/system/tabs/<tên-tab>.md` |
| Wiki nghiệp vụ (sản phẩm/vendor/giá) | `docs/wiki/business/<tên-bài>.md` — văn bản, không bảng |
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
