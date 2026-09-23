# CLAUDE.md — GoHub Intel · START HERE

> File này auto-load mỗi session. Đọc hết trước khi làm bất cứ thứ gì.
> Lịch sử chi tiết từng session nằm ở `docs/session_summary.txt` (đọc từ cuối lên) — file này CHỈ giữ
> trạng thái hiện tại + rule + checklist việc còn phải làm, KHÔNG giữ narrative cũ.
> Tinh gọn 2026-09-22 (trước đó phình to s190→s203+3, toàn bộ chi tiết đã có sẵn trong
> session_summary.txt + git log + wiki — không mất thông tin, chỉ hết trùng lặp ở đây).

---

## Trạng thái hiện tại (2026-09-22)

Branch làm việc: `staging` → merge `main` **CHỈ khi Hiếu yêu cầu RÕ RÀNG**. tsc + `next build` + `next lint` + vitest phải PASS trước khi push.

**Mốc gần nhất trên `main` — s203+3 (2026-09-21, `3693cd72`)**: audit + tăng tốc toàn hệ thống BI (gốc:
`TRIM()` phía `dim_customer` trong JOIN làm chậm ~10×, Supabase L2 cache chậm, gohub_dw chạy tuần tự) +
fix B2C Performance/KPI/trend thiếu ~90% doanh thu (loại nhầm mã KH B2C dùng chung khỏi
`excludedForB2C()`) + B2C customer-breakdown lấy kênh từ `summary.byTenant` trên đơn + export 3HK Data
Usage theo tháng + fix Bridge device tracking (creator-only) + Query Studio kiểu Power BI + fix cron
`refresh-monthly-kpis` thiếu GET.

**Tiếp theo cùng ngày 2026-09-22, đang ở `staging` — CHƯA merge main**:
- Tinh gọn CLAUDE.md (1269→162 dòng, giữ trạng thái+rule+checklist, bỏ narrative cũ — chính file này).
- Wiki business: sửa sai sót thật (mã vendor `GB` nhầm là WorldMove → đúng là Gighub, WorldMove là `WM`;
  ký tự vị trí 8 data policy sai nhiều chữ; hệ số Daily 3HK 40%→38% lỗi thời; tỷ giá cũ) + 2 bài mới
  `chinh-sach-vendor.md` (QR/đổi máy/hủy-hoàn tiền 11 vendor) + `quy-trinh-cs-van-hanh.md`.
- Đồng bộ field response GoHub API `/skus` thật (migration `v62`, Hiếu đã chạy): bỏ 5 field chết
  (`original_cost`/`reference_cost_vnd`/`final_cogs_included_vat_vnd`/`final_cogs_usd`/`wr_group` — chưa
  từng có cột), đổi `expirations`→`vendor_expirations` (tên thật), thêm `sku_ref`/`parents`/`data`/
  `speed`/`data_plan`/`topup_timing`. Vỡ 6 chỗ code đọc cột cũ (sync.py + 3 route + 1 tool Bé Gấu + 1 mô
  tả schema agent) — đã sửa hết, verify sync chạy lại thành công.
- 3HK Data Usage: tách sub-variant Unlimited theo `skus.data`/`skus.speed` (mã mới 13kt, cùng ký tự
  nhưng khác gói thật vd 500MB vs 1GB) + giải mã P1/P2 từ cấu trúc mã CŨ 14kt (SIM)/15kt (eSIM, trước rơi
  hết "Khác") — cảnh báo "Không rõ chi tiết gói" khi không tra được gì thay vì đoán im lặng. Kèm 2 bug
  FE phát hiện lúc QA: race condition (sửa bằng request-id `useRef`, áp cho 4 fetch tab-phụ-thuộc) + số
  thập phân không đồng nhất dấu `.`/`,` (thêm `fmtDec()` vi-VN).
- **s205 (2026-09-22) — VN Ecom Breakdown (B2B Performance): CH.Cost + cột CM1/%CM1 (riêng b2b_ecom_cost_monthly,
  không chung CH.Cost B2B khác).** Nhập độc lập theo customer/shop/sub-shop × tháng, pro-rata đúng công
  thức chuẩn hệ thống (cost-engine.ts, cùng logic `b2b/performance`). QA sống phát hiện + fix ngay 2 bug
  thật: (1) Vercel CDN cache response theo URL 5' bất kể app-level `nocache=1` — sửa cost lần 2 không lên
  UI dù server tính đúng, fix trả `Cache-Control: no-store` khi bypass; (2) modal prefill hiện "Chưa nhập"
  y hệt trạng thái rỗng thật trong lúc GET đang tải → dễ tưởng "phải bấm + Thêm mới hiện cost đã lưu", fix
  bằng state loading riêng. Thêm cột CH.Cost hiện trực tiếp trên bảng (không cần mở modal). Verify sống
  nhiều vòng qua browser thật (claude-in-chrome) — PASS.
- Chi tiết đầy đủ: `docs/session_summary.txt` (đọc từ cuối lên), wiki `analytics-data-model.md` §10,
  `analytics-b2c.md` §6, `analytics-quarterly.md`, `analytics-3hk-usage.md` §3.1d/§3.1e/§9,
  `analytics-devtools.md`, `analytics-b2b.md` §6, `docs/wiki/business/*.md`.

**Kiến trúc & agent hiện tại** (xem `docs/wiki/system/kien-truc-he-thong.md` để biết đầy đủ + diagram):
- Chatbot chính = **Bé Gấu** (`be-gau.ts`, 1 agent function-calling, model `gemini-3.8-flash`
  `thinkingLevel:"low"`) — thay pipeline 6-agent cũ (legacy, chỉ tham khảo logic).
- **Gấu Pro** (creator/allowed users, `creator-ai.ts`) — 20+ tools kể cả `browseWeb` (Playwright CDP →
  browserless tự host) + Bridge (đọc/điều khiển browser cá nhân qua extension, multi-tenant per-user).
- Guardian (`guardian.ts`) chỉ còn 1 ranh giới cứng trong code: `system_internal` = admin/creator, còn
  lại ai cũng như nhau (đã xoá cơ chế policy DB `access_policy`).
- Cache BI: `cachedQuery()` L1 45s + L2 Vercel Runtime Cache (nén gzip >400KB) + stale-while-revalidate +
  `deps[]` để flush theo chủ đề (không dùng prefix-list viết tay nữa) — xem `analytics-data-model.md` §8/§10.
- Deploy: Vercel (Hobby — cron tối đa 1 lần/ngày/job). Staging domain `stg-intel-v2.gohub.cloud`.
- Sync GoHub API → Supabase: `backend/data_sync/sync.py` qua GitHub Actions `sync.yml`, chạy theo `main`
  (không theo staging) — `core` (products/skus/listings) hằng ngày, `items` hằng tuần (Chủ nhật).

---

## Việc Hiếu cần làm (còn mở)

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
- [ ] Chạy `web/db/migrations/v63_assistant_memory.sql` + Reload schema Supabase — bật trí nhớ dài hạn của trợ lý (Gấu Pro). Chưa chạy thì trí nhớ tắt, chat vẫn bình thường.
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
`data`/`speed`/`data_plan`/`topup_timing`) — tất cả Hiếu đã chạy, đã verify sống. ⚠️ **v52**
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
