# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.
> Lịch sử chi tiết từng session nằm ở `docs/session_summary.txt` (đọc từ cuối lên) — file này CHỈ giữ
> trạng thái hiện tại + rule + checklist việc còn phải làm, KHÔNG giữ narrative cũ.
> Tinh gọn 2026-09-22 (trước đó phình to s190→s203+3, toàn bộ chi tiết đã có sẵn trong
> session_summary.txt + git log + wiki — không mất thông tin, chỉ hết trùng lặp ở đây).

---

## Trạng thái hiện tại (2026-09-25)

Branch làm việc: `staging` → merge `main` **CHỈ khi Hiếu yêu cầu RÕ RÀNG**. tsc + `next build` + `next lint` + vitest phải PASS trước khi push.

**Mốc gần nhất trên `main` — s208 (2026-09-25), staging = main** (đã merge theo yêu cầu Hiếu 2026-09-25). Gồm:
- **s208 — Quarter Report › Squad Progress**: thẻ **GP** mỗi squad + Target GP; summary KH mỗi squad (số KH theo tier,
  mới / cũ tiếp tục / cũ quay lại sau gián đoạn / cũ chưa quay lại — "chưa quay lại" = có mua QUÝ TRƯỚC, quý này chưa mua);
  bảng **Performance theo tháng** từng squad (T7–T9 PR + quý | target T10–12 + quý sau + %QoQ). `POST squad-targets`
  giờ MERGE theo squad + nhận `next` (target tháng quý sau). Wiki `analytics-quarterly.md` §s208, session_summary s208.
- **s207 — Gấu Pro giảm lag UI** khi hội thoại dài (memo list tin, persist localStorage khi hết stream, gộp delta bằng rAF).
  Chưa QA sống — Hiếu thử lại. Wiki `analytics-creator-ai.md` §s207.
- **Plan đang chạy (tạm)**: `docs/plans/saas-be-gau.md` — Bé Gấu SaaS đa khách hàng, chưa bắt đầu code (xem mục dưới).

**Mốc s206 (2026-09-23, `c46f7b47`).** Toàn bộ s204/s205 (3HK sub-variant,
VN Ecom CH.Cost/CM1, wiki business, v62) đã merge. s206 = **trợ lý toàn diện (Gấu Pro)** + vài fix:
- Scheduled message: Lark 11310 "card table number over limit" (≤5 bảng/card) → tách nhiều card.
- B2C Advanced MKT Profit Report mất T9 (Meta/Google hardcode) → Total MKT lấy Manage Cost; KPI Units Sold hiện %.
- Model Gemini tập trung `lib/ai-models.ts` (`GEMINI_MODEL`/`GEMINI_MODEL_PRO`, env override) + digest DM khi
  Google mở model mới. Hiếu chốt KHÔNG dùng Claude API (gói Pro không gồm API).
- Gấu Pro (creator-only): `localFiles` (daemon `local-agent/`, autostart Windows) · Kết nối Google + `googleWorkspace`
  · `larkDocs` (Lark Drive/Docs/Sheets/Wiki) · `assistantMemory` (bảng `assistant_memory`, v63) · DM Lark creator →
  Gấu Pro · tự tạo task khi bị @giao việc trong group · nhắc deadline (ké cron scheduled-messages) · digest thêm task.
- Fix Lark OAuth: redirect theo origin (không NEXTAUTH_URL) + xin scope tường minh (bỏ trống = không cấp quyền mới).
  Bug cũ: `createLarkTask` gửi hạn theo giây (Lark dùng ms) → hạn về 1970.
- QA sống đủ: file local, Google, Lark Task/Docs, trí nhớ, nhắc deadline. **Chưa QA**: DM bot + giao việc qua group.
- Chi tiết: wiki `analytics-creator-ai.md` §s206..s206+7, `analytics-scheduled.md` §E, `analytics-b2c.md` s206,
  `docs/session_summary.txt` s206.

**Kiến trúc & agent hiện tại** (xem `docs/wiki/system/kien-truc-he-thong.md` để biết đầy đủ + diagram):
- Chatbot chính = **Bé Gấu** (`be-gau.ts`, 1 agent function-calling, model `gemini-3.8-flash`
  `thinkingLevel:"low"`) — thay pipeline 6-agent cũ (legacy, chỉ tham khảo logic).
- **Gấu Pro** (creator/allowed users, `creator-ai.ts`) — 20+ tools kể cả `browseWeb` (Playwright CDP →
  browserless tự host) + Bridge (đọc/điều khiển browser cá nhân qua extension, multi-tenant per-user).
- Guardian (`guardian.ts`) chỉ còn 1 ranh giới cứng trong code: `system_internal` = admin/creator, còn
  lại ai cũng như nhau (đã xoá cơ chế policy DB `access_policy`).
- Cache BI: `cachedQuery()` L1 45s + L2 Vercel Runtime Cache (nén gzip >400KB) + stale-while-revalidate +
  `deps[]` để flush theo chủ đề (không dùng prefix-list viết tay nữa) — xem `analytics-data-model.md` §8/§10.
- Deploy: Vercel (Hobby — cron tối đa 1 lần/ngày/job). Staging `stg-intel-v2.gohub.cloud`, production `intel-v2.gohub.cloud`.
- ⚠️ cron-job.org thực tế gọi `scheduled-messages` MỖI GIỜ (:01) và đang trỏ **staging** (kiểm log 2026-09-23).
- Sync GoHub API → Supabase: `backend/data_sync/sync.py` qua GitHub Actions `sync.yml`, chạy theo `main`
  (không theo staging) — `core` (products/skus/listings) hằng ngày, `items` hằng tuần (Chủ nhật).

---

## Việc Hiếu cần làm (còn mở)

**Plan đang chạy:** `docs/plans/saas-be-gau.md` — Bé Gấu SaaS đa khách hàng (M0–M6). Đọc file đó trước khi
làm bất cứ việc gì liên quan SaaS/tenant. **File TẠM: khi mọi mốc xong (hoặc Hiếu bỏ plan) phải xoá file +
xoá dòng này**, chuyển kiến thức còn giá trị sang wiki `docs/wiki/system/`.

**Ưu tiên gần nhất (s208):**
- [ ] Quarter Report › Squad Progress: nhập **Target GP** từng squad + **target T10/T11/T12** (Revenue/GP/CM1/3HK Rev) ở nút "Target Squad" để bảng Performance theo tháng có cột target.
- [ ] Quyết định có đổi định nghĩa "KH cũ chưa quay lại" ở tab Tổng quan (`quarterly-customer-lifecycle`, hiện đếm toàn lịch sử ~112.000 KH) cho khớp Squad Progress (chỉ KH có mua quý trước) không.
- [ ] Thử lại Gấu Pro nhắn nhiều tin xem hết lag (s207).
- [ ] Trả lời 3 câu mở trong `docs/plans/saas-be-gau.md` (module SaaS cùng repo? Vercel/Supabase Pro khi nào? tên sản phẩm).

**Ưu tiên gần nhất (s206):**
- [ ] QA 2 luồng còn lại của trợ lý: nhắn DM bot ("mai 10h ...") → task; nhờ đồng nghiệp @Hiếu giao việc trong group có bot.
- [ ] Xoá file test trên Drive: Google `[TEST] Gấu Pro - …` (Doc + Sheet) và Lark `[TEST] Gấu Pro - … (Lark)` (Doc + Sheet).
- [ ] (Tuỳ chọn) Tạo secret mới cho OAuth client Google "GoHub Intel - Drive" (secret cũ đã dán vào chat) rồi cập nhật Vercel + `.env.local`.
- [ ] (Tuỳ chọn) Tăng tần suất job cron-job.org `scheduled-messages` (hiện mỗi giờ) nếu muốn nhắc deadline sát hơn.

**Ưu tiên gần nhất (s202-s203):**
- [ ] Chạy tay `GET /api/cron/prewarm-analytics` (Bearer CRON_SECRET) trên production để làm nóng Runtime Cache lần đầu.
- [ ] Kiểm cron-job.org đang gọi đúng URL **production** (không phải staging) cho `etl-cache-sync` + scheduled Daily/Weekly.
- [ ] Xác nhận cron `refresh-monthly-kpis` chạy GET đúng lịch, tab Giám sát Dữ liệu → Đối chiếu "Khớp" hết.
- [ ] **Rotate Vercel token** (đã lộ vào hội thoại Claude trước đây) — Account Settings → Tokens, xoá cũ tạo mới, cập nhật `web/.env.local`.
- [ ] Báo mọi người dùng Bridge reload extension lên 1.1.0 (`chrome://extensions`) — bản cũ bị production từ chối (thiếu Device ID).
- [ ] Quyết định hướng xử lý channel "Misc." (13 nguồn `dim_order_source` chưa map sang mã kênh mới VC/UC — xem `analytics-data-model.md`/session_summary s203+2).
- [ ] Quyết định hướng ~5.235 SIM tháng 8/2026 bị gán nhầm sang mã khung SIM K (3HK Data Usage) — hỏi vendor sửa nguồn / chấp nhận + ghi chú UI / khác.
- [ ] Hỏi bên vận hành/vendor 3HK: pipeline nạp `fact_data_usage`/`data_usage_log` (gohub_dw) đứng yên từ 2026-07-20, có job nào phụ trách không.

**Migration + config còn treo:**
- [x] v63 `assistant_memory` — Hiếu đã chạy 2026-09-23.
- [ ] Chạy `web/db/migrations/v52_external_api_keys.sql` (chưa xác nhận đã chạy) + Reload schema Supabase → tạo API key ở `/admin` tab "API bên ngoài" → gửi manager (xem `admin-product.md` §4).
- [ ] Kiểm tra lại migration v43 (`kb_wiki_group_scope`) đã chạy chưa (chưa xác nhận gần đây).
- [ ] Tạo tài khoản Upstash Redis (free tier) + set `UPSTASH_REDIS_REST_URL`/`TOKEN` trên Vercel — rate-limit hiện chạy in-memory, chưa cross-instance.

**QA còn treo (không gấp, đã tự verify code/API nhưng chưa Hiếu tự xem qua UI):**
- [ ] B2C Advanced dashboard: 3 section "GA4 Category Performance"/"GA4 Conversion Rate Charts" (tính năng của Minh) build sạch nhưng không render ra DOM — chưa tìm ra nguyên nhân, hỏi Minh xem có tự thấy chạy được ở branch riêng chưa.
- [ ] Inventory: hỏi Sapo/ETL bổ sung 3 nguồn còn thiếu (ngày nhập theo lô, `fact_inventory.batch`, ICCID tồn kho vật lý) — xác nhận qua SQL là hệ thống hiện KHÔNG có, cần ETL bổ sung trước khi code tiếp.
- [ ] Orders: tự đổi toggle "Fulfillment"→"Created" ở `/analytics/orders` xác nhận đơn SIM vật lý có hiện không (nghi `fulfiled_date` NULL phía ops/ETL, không phải bug web).
- [ ] Users/Settings/Admin(Product)/Dev Tools: tự QA bằng acc creator/admin (acc test chỉ có quyền `bod`, bị chặn đúng thiết kế).
- [ ] Quyết định lại quyền `bod` cho sub-tab SQL Query (Dev Tools) — mất khi gộp vào Dev Tools (chỉ admin/creator), báo nếu cần tách quyền riêng.
- [ ] (Không gấp) dọn tay hàng `access_policy` cũ trong Supabase `app_settings` — code không đọc nữa, xoá hay để cũng không sao.

**Việc ngoài phạm vi code (liên hệ bên ngoài):**
- [ ] Liên hệ DB owner gohub_dw cho Looker Studio / Power BI.
- [ ] Portal Affiliate — nhập App ID + Secret Shopee Affiliate Open API.
- [ ] BC Datapool — lấy đúng appSecret từ BC support (hiện luôn lỗi `[1008] Signature verification failed`).
- [ ] Cà Thread — thêm bot Bé Gấu vào group Lark + bật scope `im:message` & `im:message.reaction:readonly` + publish version mới.
- [ ] Xác nhận đã Kết nối Lark cá nhân (Creator Settings) + bot đã add vào group Sales/PIC liên quan (điều kiện để My Metrics capture real-time).

**Ghi chú nghiệp vụ cố định:**
- Quarter Report: target CM1 KH nhập là target QUÝ (không nhân × 3).
- Daily 【3】 theo QUÝ; nếu hiện "Chưa nhập target quý" → Hiếu nhập ở tab Quarter Report.
- Bé Gấu: Lark slow (skip — giới hạn kiến trúc).

---

## Migrations đã chạy (mốc gần nhất)

v31–v56 (cũ, xem `docs/session_summary.txt` nếu cần chi tiết) · **v57** `gp_action_log` · **v58**
`app_usage_events` cost · **v59** `chat_feedback` · **v60** To-Gau docs/notes/questions Realtime ·
**v61** `browser_bridge_devices` + `browser_bridge_commands.device_id/claimed_ip` · **v62**
`skus` field đầy đủ (bỏ 5 field chết, `expirations`→`vendor_expirations`, thêm `sku_ref`/`parents`/
`data`/`speed`/`data_plan`/`topup_timing`) · **v63** `assistant_memory` (trí nhớ trợ lý, 2026-09-23) — tất cả Hiếu đã chạy, đã verify sống. ⚠️ **v52**
`external_api_keys` — CHƯA xác nhận đã chạy (xem checklist trên). ⚠️ **v43** `kb_wiki_group_scope` —
chưa xác nhận lại gần đây.

---

## Đọc theo thứ tự khi bắt đầu session mới

> ⚠️ **Multi-machine**: `Bug.txt`, `new_info.txt`, `docs/ERRORS.md`, `docs/SYSTEM.md`, `docs/CHANGELOG.md` bị **gitignore** (local-only trên máy gốc của Hiếu, KHÔNG sync qua git). Trên máy mới clone/checkout, các file này **có thể không tồn tại** — bình thường, đừng báo "thiếu file". Dùng bước 2–3 dưới đây thay thế đầy đủ.

1. **CLAUDE.md** (file này) — trạng thái + rules
2. **`docs/session_summary.txt`** — log chi tiết từng session, đọc từ cuối lên (session mới nhất trước) — thay `docs/CHANGELOG.md`
3. **`docs/wiki/`** (git-tracked, LUÔN có, 2 khu `business/` + `system/`) — nguồn tham chiếu đầy đủ nhất:
   - `docs/wiki/system/*.md` — kiến trúc hệ thống, chatbot agent + Guardian, Operations Runbook, quy trình vận hành (thay `docs/SYSTEM.md`)
   - `docs/wiki/system/analytics-data-model.md` — đọc TRƯỚC mọi tab analytics khác (bảng fact/dim, `getAnalyticsSource`, filter chuẩn dùng chung, rule SQL/cache)
   - `docs/wiki/system/tabs/*.md` — 1 file/tab web: mục đích · luồng data · API · công thức · **Gotchas** (thay `docs/ERRORS.md` khi file đó vắng mặt)
   - `docs/wiki/business/*.md` — nghiệp vụ dạng văn bản (mã SKU/Item, COGS 3HK, vendor priority, combo chuẩn, import NCC...) cho CS/Sale/Product, không dùng bảng
4. **`new_info.txt`** (nếu có) — tick ✅ items chưa xong
5. **`docs/ERRORS.md`** (nếu có) — lỗi hay gặp; không có → tra "Gotchas" trong `docs/wiki/system/tabs/*.md` hoặc `docs/session_summary.txt`
6. **`Bug.txt`** (nếu có) — khi user báo có bug

---

## Rules bắt buộc

1. **Staging-first** — mọi thay đổi lên `staging`. KHÔNG push thẳng `main`.
2. **KHÔNG tự merge** staging → main dù staging PASS, chờ Hiếu yêu cầu rõ ràng.
3. **UI Strict Lock** — không đổi màu/bố cục/font/chart analytics mà không có chỉ thị từ Hiếu/Bảo.
4. **Wiki sync** — sửa tab nào → cập nhật `docs/wiki/system/tabs/<tên-tab>.md` ngay cùng lần.
5. **Commit + push sau mỗi task** — không batch nhiều task thành 1 commit lớn.
6. **tsc trước khi push** — `npx.cmd tsc --noEmit` (PowerShell, không phải `npx tsc`). `npm run lint`
   (`next lint`) cũng nên chạy — không chặn nhưng cảnh báo dead code thật.

---

## Coding rules

- Minimum code giải quyết đúng vấn đề — không thêm abstraction/feature ngoài yêu cầu.
- Chỉ touch những gì cần — không refactor code không liên quan.
- Không comment giải thích "what" — chỉ comment "why" khi thật sự không rõ.
- Tự test/fix/push, chỉ hỏi khi thao tác web hoặc chưa rõ ý tưởng.
- Mọi lỗi UI hiện: "Hiếu đang fix, vui lòng đợi".
- **Luôn tự chọn role chuyên gia phù hợp trước khi làm bất kỳ task nào** (Staff Engineer/Design
  Lead/Senior Data Analyst/DevSecOps...) — nêu 1 dòng ngắn rồi làm, không kể lể dài.
- **KHÔNG bọc `TRIM()` lên cột phía `dim_customer` trong JOIN/EXISTS** (`TRIM(f.customer_code) = c.code`,
  KHÔNG `= TRIM(c.code)`): join 355k dòng chậm ~10× (đã đo, s203). gohub_dw chạy gần như tuần tự → gộp
  query cùng bộ lọc thay vì thêm scan mới; đừng cache khối >2MB không nén. Chi tiết:
  `analytics-data-model.md` §10.
- **Luôn check lỗi query N+1 ảnh hưởng DB** khi viết/sửa code chạm DB — vòng lặp gọi query riêng lẻ cho
  từng dòng/item (thay vì JOIN/IN/batch) nổ round-trip tới gohub_dw, dễ timeout khi data lớn (đã gặp
  nhiều lần: B2C Advanced, Daily Report, Customer Report).
- **Verify field DB qua SQL/REST thật trước khi dùng làm khoá chính** — comment/wiki mô tả field không
  phải bằng chứng field tồn tại (đã dính 2 lần: `data_policy_code`, `organization_code` — cột chết/ảo).

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
- Chatbot chính: **Bé Gấu** (`be-gau.ts`, single function-calling agent) — pipeline cũ = legacy
- Creator AI: **Gấu Pro** (`creator-ai.ts`, 20+ tools, kể cả browseWeb + Bridge)
- FE design: xem `.ai/FESkill.md`
- Coding rules chi tiết: `.ai/CLAUDE.md`
