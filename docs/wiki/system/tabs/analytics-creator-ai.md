---
title: "Gấu Pro (Creator AI)"
page_type: tab_guide
is_hidden: true
updated: 2026-09-07
---

# Gấu Pro — Creator AI

**Route:** `/analytics/creator/ai`  
**API:** `POST /api/creator-ai/chat`  
**Agent:** `web/src/lib/agents/creator-ai.ts`

## Mục đích

AI riêng dành độc quyền cho role **creator** (Hiếu). Không phục vụ team — không có guardian, không role filter, toàn quyền truy cập mọi dữ liệu. Dùng để:

- Query trực tiếp gohub_dw + Supabase mà không cần vào DB console
- Phân tích dữ liệu, vẽ chart, tạo bảng thống kê
- Hỏi về code, kiến trúc hệ thống, quy trình kỹ thuật
- Tìm kiếm web với trích dẫn nguồn uy tín
- Tư vấn kinh doanh, chiến lược, tài chính theo vai trò chuyên gia

## Phân quyền

- **Chỉ creator** (403 với bất kỳ role nào khác)
- Không guardian, không role_filter, không COGS restriction
- Có thể truy cập bảng SENSITIVE (users, app_settings, conversations, v.v.)

## Luồng xử lý

```
POST /api/creator-ai/chat { messages: [{role, content}] }
  ↓ (creator-only check)
  ↓ Convert to Gemini history
  ↓ runCreatorAI(history, lastMsg)
      ↓ Load partner tiers + GA4 sites (parallel)
      ↓ Gemini 3.6 Flash với 7 tools (max 20 iterations)
          executeSQL     → gohub_dw PostgreSQL
          querySupabase  → Supabase (ALL tables incl. sensitive)
          listSupabaseTables
          queryGA4       → Google Analytics 4
          queryGSC       → Google Search Console
          queryProduct   → Supabase product/sku lookup
          webSearch      → Gemini Google Search grounding (separate call)
      ↓ Collect web sources from webSearch calls
      ↓ Return { text, sources[] }
  ↓ NextResponse.json({ text, sources })
```

## Tools

| Tool | Nguồn dữ liệu | Mô tả |
|------|--------------|-------|
| `executeSQL` | gohub_dw (Postgres) | SELECT/WITH query tự do |
| `querySupabase` | Supabase REST | Tất cả bảng (bao gồm sensitive) |
| `listSupabaseTables` | - | Liệt kê bảng có thể query |
| `queryGA4` | Google Analytics 4 | Traffic, conversion, revenue website |
| `queryGSC` | Google Search Console | SEO, keyword, click data |
| `queryProduct` | Supabase skus/products | Lookup chi tiết 1 SKU/product |
| `webSearch` | Google Search (Gemini grounding) | Tìm kiếm web với citation |
| `browseWeb` (s195, đa trang từ s195+5) | Headless browser (CDP, container tự host) | Mở URL thật, chạy JS đầy đủ, đọc nội dung — cho trang SPA/JS-nặng mà webSearch không đọc được. Đọc được NHIỀU trang/lần gọi: `urls[]` (list biết trước), `pagination.mode=click_next` (bấm Next), `pagination.mode=infinite_scroll` (cuộn tự load). KHÔNG dùng cho portal có login (đó là `browsePortal`) |
| `readMyBrowser` (s195+1) | Extension trên máy người dùng (bridge queue riêng/user, s195+3) | Đọc tab Chrome THẬT đang mở của người gọi (list_tabs/read_tab) — dùng session đăng nhập sẵn của họ. Mọi user có quyền Gấu Pro (`gp_enabled`) |
| `controlMyBrowser` (s195+1, Auto từ s195+2, multi-tenant s195+3) | Extension trên máy người dùng (bridge queue riêng/user) | click/fill/navigate/scroll trên tab Chrome THẬT của người gọi — thực thi NGAY (Auto), chỉ hiện notification không chặn để biết. `press_enter` cho ô nhập kiểu sheet cần Enter mới commit. Mọi user có quyền Gấu Pro |

## Web Search

- Tách thành 1 Gemini call riêng với `tools: [{ googleSearch: {} }]`
- Không thể kết hợp googleSearch với functionDeclarations trong cùng 1 call → dùng 2 model instance
- Kết quả gồm text + `groundingMetadata.groundingChunks` (sources với title + URL)
- Sources được thu thập và trả về trong response.sources[] để FE hiển thị
- Nếu grounding thất bại: trả error message, agent tiếp tục từ knowledge training

## System prompt

Vai trò: "Gấu Pro" — private AI của Hiếu  
Expert personas tự động theo domain:
- Data/BI: Senior Data Scientist 15+ năm
- Software Engineering: Staff Engineer / System Architect
- Business Strategy: ex-McKinsey Principal (eCommerce/telecom)
- Financial Analysis: CFA, ex-investment banking
- Marketing/Growth: Growth Lead tại Series B/C startup
- Product: ex-PM at tech unicorns

Rules cứng:
1. Data queries → LUÔN query DB thật, không ước tính
2. Suggestions → dựa trên data thật + expert persona
3. Web search → LUÔN cite source URL
4. Cho phép hỏi code/system/prompt/schema (không có guardian)

## UI

- Route: `/analytics/creator/ai`
- Màu theme: violet (#7c3aed) để phân biệt với Bé Gấu (brand-600 blue)
- Không lưu conversation lên Supabase — in-memory state only
- Show elapsed timer khi loading (có thể 30-60s)
- Hiển thị web sources dưới mỗi assistant message (có link)
- Chart rendering: reuse `ChatChart` component (```chart JSON block)
- Auto-resize textarea (Shift+Enter = xuống dòng)
- maxDuration = 300s (Vercel Pro)

## SQL rules quan trọng (trong system prompt)

```sql
-- fulfiled_date (1 chữ l) là TEXT → phải cast
WHERE f.fulfiled_date::DATE >= '2026-01-01'
AND   f.fulfiled_date::date <= CURRENT_DATE - 1

-- dim_sku dùng cột "sku" (không phải sku_code)
JOIN dim_sku sk ON TRIM(f.sku) = TRIM(sk.sku)

-- 3HK vendor: CHUẨN toàn hệ thống = '3HKDATAPOOL' (KHÔNG dùng LIKE '3HK%' — gồm dư 61 SKU vendor "3HK")
WHERE REPLACE(UPPER(TRIM(sk.vendor)),' ','') = '3HKDATAPOOL'

-- Loại tài khoản hệ thống (phân tích B2B theo tier)
AND c.name NOT IN ('B2C Customer US','B2C Customer VN','B2B Ops')
```

## Chuẩn nghiệp vụ trong system prompt (2026-08-02, đồng bộ audit s125/s126)

- **3HK** = `REPLACE(UPPER(TRIM(vendor)),' ','') = '3HKDATAPOOL'` (không LIKE) → số 3HK của Gấu Pro khớp mọi tab.
- **CM1 / Op Cost**: phí `amount` pro-rata theo ngày + phí `percent` **CỘNG HẾT (SUM, không MAX)** — nhất quán BOD/Channels/B2B/B2C/Quarterly.
- **Total GP ≠ B2B GP + B2C GP**: nhóm order source `Internal-Transaction` (kênh "Misc.") = SIM tiêu dùng nội bộ (COGS thật, revenue 0 → GP âm). Total GP cộng nhóm này; prompt yêu cầu Gấu Pro giải thích khoản chênh khi người hỏi đối chiếu.

## Ổn định (stability)

- `genWithRetry` (creator-ai.ts): bọc mọi `model.generateContent` (initial + 20 vòng loop + fallback) → retry 3× backoff 0.8s/1.6s cho lỗi TẠM THỜI (429/quota/5xx/overload/timeout/network). Lỗi thật (prompt/schema) ném ngay. Trước đây 1 lỗi transient là hỏng cả request.

## File upload dùng chung với Bé Gấu (s192, 2026-09-05)

`FileContext` + `parseUploadedFile()` (đọc Excel/PPTX/DOCX/CSV/JSON/PDF/ảnh) đã tách ra
`web/src/lib/agents/file-parser.ts` — `creator-ai.ts` giờ `import/export type { FileContext }` từ đó thay
vì tự định nghĩa (không đổi hành vi Gấu Pro). Bé Gấu (`be-gau.ts`) nay dùng chung file này để có upload
ảnh/file — xem [[chatbot]] mục 4a. Route `/api/creator-ai/chat` không đổi gì khác ngoài import.

## Xuất file dùng chung với Bé Gấu (s192+1, 2026-09-05)

`/api/creator-ai/export` nay gọi `buildXlsxFromSql`/`buildDocxFromMarkdown`
(`web/src/lib/export-docs.ts`, tách từ chính route này) — cùng hàm với route mới của Bé Gấu
`/api/chat/export`. Chỉ khác quyền truy cập: route Gấu Pro vẫn `requireAccess()` admin/creator, route Bé
Gấu mở cho mọi role đã login (rate-limit riêng). FE `ExportBar` (nút CSV/Excel/JSON/PDF/Word) tách sang
`web/src/components/chat-export.tsx`, nhận `apiEndpoint` để trỏ đúng route — trang này giờ import thay vì
tự định nghĩa. Không đổi hành vi hiển thị/logic xuất của Gấu Pro.

## Xuất dữ liệu & báo cáo (2026-08-02)

- **Excel FULL data từ SQL (fix "data cut >200 dòng")**: model chỉ THẤY 200 dòng đầu của executeSQL → nếu tự gõ lại vào \`\`\`csv thì cắt + sai. Nay model đặt \`sql:\` (câu SELECT gốc, đặt CUỐI marker \`\`\`export) → nút Excel gọi `POST /api/creator-ai/export {format:"xlsx", sql}` chạy lại query server-side → xuất TOÀN BỘ dòng. Guard: chỉ SELECT/WITH, 1 statement, creator/admin. Verify: query 146 KH → xlsx đủ 146 dòng.
  - \`\`\`csv giờ chỉ là PREVIEW (~20 dòng) hiển thị inline; dữ liệu Supabase (không SQL) vẫn dùng \`\`\`csv đầy đủ.
- **Báo cáo chi tiết (fix "hời hợt")**: SYSTEM_PROMPT thêm mục "Report depth" — khi hỏi báo cáo/phân tích: bối cảnh+kỳ → bảng số liệu (+chart) → 3-5 phát hiện chính → đối chiếu (Internal-Transaction/exclude/3HK) → đề xuất gắn mục tiêu Q3. Ép cụ thể, sâu.
- **Chính xác**: dùng định nghĩa chuẩn (3HK=3HKDATAPOOL, op-cost SUM percent, exclude NOT IN) → số khớp các tab.
- Word (.docx) server-side markdown→docx; PDF client html2canvas+jsPDF (giữ nguyên).

## Vận hành

- Timeout: 300s (cấu hình `export const maxDuration = 300` trong route)
- Iterations: tối đa 20 (nhiều hơn bi-analyst (12) và data-explorer (10))
- Không có caching (mỗi request mới query DB fresh)
- Error: trả `{ error: message }` với status 500, FE hiển thị lỗi thật (creator role)

## Thêm/sửa

| Muốn thay đổi | File |
|---|---|
| System prompt / persona | `web/src/lib/agents/creator-ai.ts` → `SYSTEM_PROMPT` |
| Thêm/sửa tool | `web/src/lib/agents/creator-ai.ts` → tool declarations + switch case |
| Phân quyền | `web/src/app/api/creator-ai/chat/route.ts` → role check |
| UI / quick prompts | `web/src/app/(dashboard)/analytics/creator/ai/page.tsx` |
| Nav label/icon | `web/src/lib/nav.ts` → `CREATOR_GROUP` |

## Tab liên quan: Usage Analytics (`/analytics/creator/usage`)

Thống kê ai vào tab nào + Bé Gấu hỏi gì (chỉ creator). Nguồn: Supabase `app_usage_events` (ghi qua `/api/analytics/track`), đọc qua `/api/analytics/usage-stats`.

**Fix 2026-08-02:**
- **Định danh user** — trước dùng `session.user.email` nhưng nhiều user KHÔNG có email trong DB (auth `email: user.email || ""`) → mọi event gom vào 1 user rỗng, "Theo User"/top user hỏng. Nay `track/route.ts` + `chat/route.ts` dùng `email || username` (username luôn có).
- **Chat event không lưu** — `logChat` trong `chat/route.ts` trước fire-and-forget (`void`); serverless không có waitUntil → insert bị cắt khi handler trả stream → 0 chat event. Nay `await logChat(...)` (thêm user_name) → tab Chatbot (phân bố agent/top câu hỏi/log) mới có dữ liệu.
- **Export** — thêm nút Export (.xlsx) xuất toàn bộ event trong kỳ (thời gian/loại/user/role/tab/agent/câu hỏi).
- LƯU Ý: 156 event lịch sử vẫn user rỗng (không backfill); event MỚI mới có định danh.

---

## § Gấu Pro Update s132 (2026-08-04)

Nâng cấp Gấu Pro thành assistant toàn năng — 8 tính năng mới:

### Intelligence & Data Accuracy
1. **Auto date context** (`buildDateContext()` creator-ai.ts) — inject ngày hôm nay / MTD / tháng trước / YTD (giờ VN) vào system prompt. Gấu tự hiểu "tháng này"/"hôm nay" không hỏi lại ngày; luôn cắt data tới hôm qua (CURRENT_DATE-1).
2. **Self-correction SQL retry** — `execSQL` khi 0 rows hoặc value > 1e12 → trả `auto_retry_suggested:true` + `retry_hint`; system prompt bắt buộc Gấu sửa query & chạy lại (tối đa 2 lần) trước khi kết luận.
3. **KB auto-lookup lượt đầu** — conversation mới (history≤1) → tự nạp `creator_kb` vào system prompt (nguồn sự thật, override training data). Không nạp lại ở multi-turn.
4. **Export marker auto** — bảng > 15 dòng → tự thêm ```export (excel + `sql:` nếu gohub_dw); user nói "xuất/tải/download" → luôn có marker.

### Context & Conversation
5. **Conversation summarization** (`compressHistory()` chat/route.ts) — > 20 turns hoặc > 30k chars → tóm tắt 10 turns cũ nhất bằng 1 Gemini call, giữ 10 turns gần nhất. Badge "Lịch sử cũ đã tóm tắt" trên UI.
6. **Follow-up chips** — Gấu trả ```followup block (3 gợi ý ≤8 từ); UI render chip dưới message, click → submit ngay.
7. **Lark Base** (`queryLarkBase` tool) — đọc dữ liệu Lark Base (CS ticket/inventory/tracking). Không app_token→list Base; +app_token→list tables; +table_id→đọc records. Cần scope `bitable:app:readonly`.

### UX
8. **Voice input** — nút mic (Web Speech API, vi-VN) cạnh nút gửi; feature-detect, ẩn nếu browser không hỗ trợ.
9. **Chart types mở rộng** (`chat-chart.tsx`): ngoài bar/line/area/pie, thêm:
   - **stacked bar**: multi-metric + `stacked:true`
   - **waterfall**: single-series `chart_type:"waterfall"` (P&L breakdown, âm=đỏ/dương=xanh/`isTotal`=xanh dương)
   - **scatter**: multi-metric `chart_type:"scatter"` + `x_key`/`y_key`
   Cả 3 có nút tải PNG. System prompt Gấu Pro có ví dụ đủ 3 loại.

### Lark OAuth (duyệt task cá nhân)
App token KHÔNG list được task/tasklist riêng của user (Lark trả 0) → cần **user_access_token** (OAuth).
- Flow: nút "🔗 Kết nối Lark" (header Gấu Pro, creator only) → `/api/lark/oauth/start` → Lark authorize → `/api/lark/oauth/callback` đổi code→token → lưu `app_settings.lark_oauth_creator` (JSON access+refresh, auto refresh).
- `getLarkUserToken()` (lark.ts) tự refresh; `runLarkTask` ưu tiên user token cho list/tasklist/get/create/update. Chưa kết nối → list báo "bấm Kết nối Lark".
- create/update vẫn chạy được bằng app token nếu chưa OAuth (fallback).
- **open_id thật của Hiếu = `ou_e5af3c7f447984052c1c5a5c2f594127`** (mã cũ `...c2f5` bị cắt cụt → "not a valid user id"). Lấy từ `users.lark_open_id` (role=creator).

### ENV / scope cần (Hiếu)
- `LARK_CREATOR_USER_ID` = `ou_e5af3c7f447984052c1c5a5c2f594127` (đầy đủ) — ĐÃ set Vercel. Dùng cho DM tự học + fallback app token.
- Scope Lark: `task:task` (ĐÃ có) + `bitable:app:readonly` (ĐÃ có). `task:tasklist` = tùy chọn (chỉ cần nếu muốn duyệt Task List riêng — OAuth scope hiện chỉ xin `task:task`).
- **Redirect URL** (Lark Security Settings): `https://stg-intel-v2.gohub.cloud/api/lark/oauth/callback` (staging). Thêm domain production khi merge main.
- redirect_uri sinh động theo `req.nextUrl.origin` (khớp domain đang truy cập) — không phụ thuộc NEXTAUTH_URL.
- Staging domain: `https://stg-intel-v2.gohub.cloud`. ✅ OAuth ĐÃ CHẠY (staging).
- **Gotcha "thiếu quyền" khi authorize**: (1) bỏ tham số `scope` trong URL để Lark tự dùng scope app đã publish (tránh lệch tên scope); (2) sau khi thêm quyền trong Lark PHẢI **publish version mới** — OAuth dùng quyền của version đã release, không phải bản nháp.

#### Ghi chú tham khảo
- **Tỷ giá nội bộ** (nhập ở Admin → Tỷ Giá Nội Bộ) lưu ở Supabase `app_settings`, key prefix `fx.` (vd `fx.usd_vnd`, `fx.twd_usd`), `category="fx_rate"`. Ghi qua `PATCH /api/admin/settings`.

---

## § Gấu Pro Wave 1 — s138 (2026-08-08)

### Trend Intelligence

**Cron `refresh-trends`** (`/api/cron/refresh-trends`, chạy 8h ICT mỗi ngày):
- 11 queries / 6 categories: `travel_sim`, `travel`, `competitor`, `content_format`, `technology`, `seasonal`
- Lưu vào Supabase `trend_snapshots` (migration v18 — Hiếu đã chạy)
- Tách `runWebSearch` → `web/src/lib/web-search.ts` (lightweight, tránh import creator-ai.ts nặng trong cron)

**Tool `getTrendSnapshots`** (trong Gấu Pro):
- Đọc trend_snapshots 7 ngày gần nhất (tùy chỉnh days/category/platform)
- Fallback: nếu snapshot rỗng hoặc cũ → gợi ý gọi thêm `webSearch` live
- Dùng kết hợp với `webSearch` để viết script TikTok

**Script generation format** (kịch bản TikTok chuẩn):
Hook → Context → Solution → CTA → Hashtags → Storyboard, kèm 2 biến thể hook A/B

### Image Generation (Pollinations AI — FLUX)

**Tool `generateImage`:**
- URL-based: browser tải ảnh trực tiếp (không base64 bloat trong history)
- Model: FLUX (state-of-the-art open source, tương đương DALL-E 3)
- Tham số: `enhance=true` (Pollinations dùng LLM cải thiện prompt trước khi gửi FLUX)
- Resolution: 1:1=1024×1024 | 9:16=864×1536 (TikTok native) | 16:9=1536×864
- Chất lượng prompt: thêm "highly detailed, 8K, masterpiece, no text, no watermark"

**Để cải thiện tiếp:**
- Prompt template rõ hơn (style + subject + lighting + quality suffix)
- Negative hints trong prompt: "no blur, sharp focus, no watermarks"
- Video generation: chờ Kling AI API key (`KLING_API_KEY` — Hiếu đăng ký klingai.com)

## § Gấu Pro s195 (2026-09-07) — tool `browseWeb` (headless browser thật)

Bước đầu trong lộ trình biến Gấu Pro thành "agent assistant" rộng hơn (theo yêu cầu Hiếu). Trước đây Gấu
Pro chỉ đọc web qua `webSearch` (snippet Google grounding, không render JS) hoặc `browsePortal` (fetch +
regex thô, chỉ dùng cho portal NCC có login sẵn credential). Không có cách đọc 1 trang SPA/JS-nặng như
người thật mở browser.

- **Kiến trúc**: `web/src/lib/agents/creator/tools/browser.ts` (`runBrowseWeb`) dùng `playwright-core`
  (gói nhẹ, KHÔNG bundle Chromium — team từng né đúng vấn đề Puppeteer/Chromium-trong-serverless, xem
  `web/src/lib/weekly-report/card-images.ts:1-2`) để `chromium.connectOverCDP()` vào 1 container
  `browserless/chrome`/`browserless/chromium` **Hiếu tự host** trên 1 VM/PaaS luôn bật (KHÔNG phải
  Vercel — Vercel không chạy container dài hạn). Vercel function chỉ là client CDP nhẹ.
- **Env cần set trên Vercel** (Production + Preview): `BROWSERLESS_WS_URL` (endpoint WS container tự
  host), `BROWSERLESS_TOKEN` (khớp `TOKEN` set trong container). Thiếu 1 trong 2 → tool trả lỗi rõ ràng,
  không throw 500 (theo đúng pattern `STABILITY_API_KEY`/`KLING_API_KEY`).
- **Tham số**: `url` (bắt buộc), `actions[]` tối đa 8 bước — allow-list `click`/`fill`/`scroll`/`wait`
  (CỐ Ý không cho `page.evaluate` JS tuỳ ý — input do model sinh ra, phải giới hạn bề mặt tấn công),
  `wait_ms`. Trả `title` + `content` (innerText, cắt 15000 ký tự khớp `browsePortal`) + `action_log`.
  Luôn `browser.close()` trong `finally` (tránh leak browser-minute/session trên container nhỏ) + timeout
  tổng ~25s.
- **Chỉ Gấu Pro** — KHÔNG merge sang Bé Gấu ở bước này (giống tiền lệ `generateImageStability`/
  `generateVideo`: tool mới/tốn tài nguyên hạ tầng riêng thì giữ ở Gấu Pro trước).
- **Chuẩn bị multi-tenant (chưa bật)**: migration `v49_creator_kb_owner_prep.sql` thêm cột nullable
  `creator_kb.owner_username` + `chatbot_learning_log.target_owner_username` — KHÔNG đổi hành vi code nào
  (mọi query vẫn đọc/ghi toàn bảng như cũ), chỉ tránh việc sau này phải retroactive-migrate bảng đang có
  data thật khi Hiếu quyết định bật KB riêng/tự học riêng cho từng nhân viên.
- **Lộ trình còn lại** (chưa làm, phase riêng): điều khiển browser CÁ NHÂN Hiếu qua extension (giống cơ
  chế `claude-in-chrome`) · mở rộng scope Lark OAuth cá nhân (`lark_oauth_creator`) · bật thật multi-tenant
  (cần chính sách privacy rõ trước khi đọc dữ liệu Lark cá nhân của người khác).

## § Gấu Pro s195+1 (2026-09-07) — Extension điều khiển browser cá nhân Hiếu

Tiếp lộ trình s195: `browseWeb` duyệt web CÔNG KHAI, còn phase này cho Gấu Pro đọc/thao tác trên chính tab
Chrome ĐANG MỞ của Hiếu (dùng session đăng nhập thật Lark/Sapo/portal) — giống cơ chế `claude-in-chrome`.

- **Kiến trúc**: hàng đợi lệnh Supabase (`browser_bridge_commands`, migration `v50_browser_bridge.sql`) +
  polling 2 chiều — KHÔNG dựng thêm hạ tầng WebSocket (Vercel serverless không giữ được kết nối 2 chiều
  tới browser Hiếu). Gấu Pro (2 tool mới, `web/src/lib/agents/creator/tools/bridge.ts`) INSERT lệnh rồi
  poll 2s/lần chờ `status=done`; Extension (máy Hiếu) poll `GET /api/creator-ai/bridge/next` mỗi ~15s để
  lấy lệnh, thực thi, rồi `POST /api/creator-ai/bridge/result` ghi kết quả.
- **Auth**: 1 token cá nhân lưu Supabase `app_settings` key `browser_bridge_token` (plaintext — đúng mức
  đơn giản `MCP_SECRET` đang dùng, không phải password hệ thống ngoài). Sinh/xem token qua trang mới
  `/analytics/creator/bridge` (creator-only) — `GET/POST /api/creator-ai/bridge/token`.
- **2 tool**: `readMyBrowser` (`list_tabs`/`read_tab`) và `controlMyBrowser` (`click`/`fill`/`navigate`/
  `scroll`). ⚠️ Thiết kế BAN ĐẦU bắt buộc Hiếu duyệt qua `chrome.notifications` trước khi thực thi
  click/fill/navigate — **đã đổi sang Auto ngay trong s195+1** (xem mục "s195+2" bên dưới), đoạn này giữ để
  hiểu lý do kiến trúc hàng đợi có cột `requires_confirm` (nay chỉ mang tính phân loại/log, không còn chặn
  thực thi).
- **Extension** (`browser-extension/` — ngoài `web/`, không qua Next.js build): Manifest V3, unpacked only
  (Hiếu tự `chrome://extensions` → Developer mode → Load unpacked — KHÔNG publish Chrome Web Store).
  - `background.js`: vòng lặp `setTimeout` đệ quy ~15s giữ service worker "sống" (mỗi fetch reset đồng hồ
    idle-suspend ~30s mặc định MV3) — tránh dùng `chrome.alarms` làm vòng lặp chính (Chrome ép tối thiểu 1
    phút/lần cho alarm định kỳ, quá chậm). `chrome.alarms` 1 phút chỉ làm lưới an toàn phòng worker bị kill.
  - **Gotcha đã xử lý**: Lark/Sapo web là SPA React — set `.value` trực tiếp KHÔNG kích hoạt `onChange`,
    phải dùng native setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`)
    rồi `dispatchEvent(new Event('input',{bubbles:true}))` (xem `execAction()` action `fill`).
  - Chỉ chạy khi Hiếu bật toggle "Bridge" ở popup (`popup.html`/`popup.js`) — không âm thầm nền 24/7.
- **Chỉ Gấu Pro, chỉ Hiếu** — không có khái niệm nhiều token/nhiều người pair ở v1.
- **Việc dọn tay** (không có cron riêng): `DELETE FROM browser_bridge_commands WHERE created_at < NOW() -
  INTERVAL '7 days'` định kỳ, giống tiền lệ dọn lark dedup entries.

## § Gấu Pro s195+2 (2026-09-07) — Auto (bỏ Duyệt) + fix Enter + chặn user khác dùng bridge

Hiếu QA thử s195+1 ngay trong ngày, phát hiện 3 việc cần sửa:

1. **Bỏ bước Duyệt, chuyển Auto** — lý do Hiếu nêu: thói quen người dùng sẽ luôn bấm Duyệt, khiến bước xác
   nhận chặn (`chrome.notifications` có nút Duyệt/Từ chối, `requireInteraction:true`) không còn giá trị an
   toàn thật, chỉ gây chậm. `background.js` bỏ hẳn `askConfirm()`/`onButtonClicked` — `processCommand()` thực
   thi NGAY mọi action, chỉ còn `notifyAction()` hiện notification **không chặn** (`requireInteraction:false`,
   không nút) để Hiếu biết Gấu Pro vừa làm gì, không cần bấm. Cột `requires_confirm` trong
   `browser_bridge_commands` vẫn giữ (đổi ý nghĩa: chỉ còn phân loại "action ghi" cho mục đích log, không
   còn chặn thực thi).
2. **Fix "fill xong không thấy chữ hiện lên"** — Hiếu test điền 1 dòng vào ô nhập nhanh kiểu spreadsheet,
   Gấu Pro báo đã fill nhưng không hiện vì ô đó cần phím **Enter thật** để commit dòng mới (chỉ set
   `.value` + dispatch `input`/`change` là chưa đủ cho loại ô này, khác input thường). Thêm tham số
   `press_enter` (`controlMyBrowserDecl`, `bridge.ts`, `background.js` action `fill`) — khi `true`, sau khi
   set value sẽ dispatch thêm `keydown`/`keypress`/`keyup` phím Enter. **Gotcha kỹ thuật**: `keyCode`/`which`
   không set được qua `new KeyboardEvent(type, {keyCode:13})` (browser giữ readonly, constructor bỏ qua) —
   phải `Object.defineProperty(ev, "keyCode", {get: () => 13})` đè lên sau khi tạo event thì code cũ (check
   `e.keyCode===13`) mới nhận đúng. Gấu Pro tự quyết định truyền `press_enter=true` khi ngữ cảnh là ô
   nhập nhanh/sheet cell (mô tả trong description tool, không phải mặc định luôn bật vì textarea nhiều dòng
   sẽ hỏng nếu Enter tự động xuống dòng).
3. **Fix lỗ hổng thật: user khác trong `gp_allowed_users` gọi được bridge = thao tác browser của HIẾU, không
   phải của họ** — Hiếu hỏi "người khác có dùng được không". Phát hiện khi audit: `readMyBrowser`/
   `controlMyBrowser` trước nằm chung `ALL_TOOL_DECLARATIONS` tĩnh mà MỌI user có quyền Gấu Pro đều thấy y
   hệt nhau (route `/api/creator-ai/chat` chỉ check "có được dùng Gấu Pro không" — creator hoặc trong
   `gp_allowed_users` — KHÔNG phân biệt tool theo từng người). Vì bridge là **1 token = 1 browser** (máy
   Hiếu), nếu Hiếu từng cấp Gấu Pro cho ai đó qua Creator Settings, người đó gọi `readMyBrowser`/
   `controlMyBrowser` sẽ đọc/thao tác thẳng lên browser THẬT của Hiếu — rò rỉ dữ liệu cá nhân nghiêm trọng,
   không phải lỗi phân quyền thường. Fix: `runCreatorAI()` (`creator-ai.ts`) nhận thêm tham số `isCreator`,
   hàm mới `buildFunctionDeclarations(isCreator)` loại bỏ 2 tool bridge khỏi danh sách nếu `!isCreator`.
   `route.ts` truyền `isCreator` (đã có sẵn biến, trước đây chỉ dùng để check allowlist chứ chưa truyền vào
   agent). Chặn bằng declaration (Gemini không thấy tool thì không gọi được) — đúng pattern đã dùng ở
   `be-gau.ts` (`GP_TOOLS_ADMIN_ONLY`), không phải qua guardian.

## § Gấu Pro s195+3 (2026-09-07) — Bridge multi-tenant: mỗi user tự pair browser CỦA CHÍNH HỌ

Hiếu hỏi ngược lại mục 3 ở s195+2: "nhưng giờ tôi muốn người khác có thể dùng Gấu Pro như 1 trợ lý của họ
nữa thì sao". Khác hẳn rủi ro đã cảnh báo trước (đó là *Hiếu đọc dữ liệu người khác* — cần chính sách
privacy) — đây là *mỗi người tự cấp quyền cho máy của chính họ*, giống hệt Hiếu đang làm, nên sửa đúng gốc
rễ (multi-tenant thật) thay vì tiếp tục khoá creator-only.

- **Token/queue chuyển 1-global → 1-per-user**: bảng mới `browser_bridge_pairings` (migration
  `v51_browser_bridge_multitenant.sql`, `username TEXT PRIMARY KEY, token TEXT UNIQUE, last_seen`) thay
  cho `app_settings.browser_bridge_token` cũ. `browser_bridge_commands` thêm cột `owner_username` — mỗi
  lệnh biết thuộc hàng đợi của ai. Migration best-effort giữ token Hiếu (creator) đã pair từ s195+1, khỏi
  re-pair (không khớp thì tự tạo lại 1 lần, không sao).
- **3 route bridge đổi sang scope theo user**: `token/route.ts` bỏ `requireCreator()` →
  `requireGpAccess()` (helper mới `web/src/lib/gp-access.ts` — `hasGpAccess(role, username)`, tách ra dùng
  chung với `chat/route.ts` vốn có `loadGpAllowed()` riêng lẻ trước đó); GET/POST đọc/ghi đúng row của
  CHÍNH session gọi. `next/route.ts`/`result/route.ts`: Bearer token → `SELECT username FROM
  browser_bridge_pairings WHERE token=$1` → mọi thao tác sweep/claim/update chỉ trong
  `WHERE owner_username=$username` của chính họ.
- **Thread `username` xuống tool**: `runCreatorAI()` nhận thêm `username`, truyền vào
  `dispatchTool(call, onEvent, sources, { username })` (tham số thứ 4 mới, optional — không phá call site
  cũ), `bridge.ts` (`runReadMyBrowser`/`runControlMyBrowser`/`enqueueAndPoll`) nhận `username` để stamp
  `owner_username` lúc INSERT. `chat/route.ts` truyền `session.user.username`.
- **Mở lại declaration cho mọi user có quyền Gấu Pro**: `CREATOR_ONLY_TOOLS` (`creator-ai.ts`) rỗng lại —
  rủi ro cũ (1 token = browser Hiếu) đã hết vì mỗi user giờ có token/queue riêng biệt hoàn toàn. Giữ cơ chế
  `buildFunctionDeclarations()` cho tool nào thật sự cần creator-only về sau.
- **UI**: `bridge/page.tsx` đổi guard từ `role==="creator"` sang đọc `gp_enabled` từ `/api/user/me` (field
  đã có sẵn, dùng chung với `analytics/creator/ai/page.tsx` và `sidebar.tsx` — KHÔNG cần field/route mới).
  `sidebar.tsx` thêm nav "Bridge" vào đúng khối `gpEnabled &&` (chỗ hiện "Gấu Pro" cho non-creator allowed
  user) — giữ nguyên entry "Bridge" trong `CREATOR_GROUP` tĩnh cho creator, 2 nơi phục vụ 2 nhóm khác nhau.
- **Không đụng**: persona/system prompt Gấu Pro, `nav.ts` Command Palette (vốn đã không có nhánh
  `gp_enabled` cho "Gấu Pro" — gap có từ trước, không do task này), việc dọn `app_settings.browser_bridge_*`
  cũ (vô hại, để đó).

**Gotcha QA (2026-09-07)**: acc khác bấm "Tạo token" → 500. Log Vercel (`console.error` thêm vào lúc debug,
xem `bridge/token/route.ts`) cho thấy: `Could not find the table 'public.browser_bridge_pairings' in the
schema cache` (`code: PGRST205`). **Không phải bug code** — PostgREST (lớp API Supabase dùng) cache schema
DB, tạo bảng mới bằng migration đôi khi không tự trigger reload cache ngay. Fix: Supabase Dashboard →
Database → API → **Reload schema**, hoặc chạy `NOTIFY pgrst, 'reload schema';` trong SQL Editor. Sau đó
GET/POST `bridge/token` hoạt động bình thường ngay, không cần redeploy Vercel (lỗi hoàn toàn phía Supabase).
Nếu sau này thêm bảng mới bằng migration mà gặp `PGRST205`, nhớ ngay lỗi này.

**Xác nhận trình duyệt**: hoạt động trên Microsoft Edge (và mọi trình Chromium khác: Brave/Opera/Vivaldi)
— chỉ khác chỗ vào `edge://extensions` thay vì `chrome://extensions`, code dùng chung API `chrome.*`
chuẩn Chromium nên không cần sửa gì.

## § Gấu Pro s195+5 (2026-09-07) — `browseWeb` đọc được NHIỀU trang trong 1 lần gọi

Hiếu phản hồi `browseWeb` (s195) chỉ đọc được đúng 1 trang mỗi lần gọi — không đủ cho việc lấy dữ liệu tự
động từ trang có nhiều trang/nhiều mục. Hỏi rõ 3 kiểu phân trang thật gặp (Hiếu chọn cả 3) + kiểu output
(text thô gộp lại, đơn giản hơn structured extraction) trước khi code.

`runBrowseWeb()` (`web/src/lib/agents/creator/tools/browser.ts`) giờ có 3 chế độ, tự chọn theo tham số
truyền vào (không phá tương thích ngược — gọi như cũ với chỉ `url` vẫn y hệt hành vi trước):

1. **`urls: string[]`** (tối đa 20) — danh sách URL biết trước (vd Gấu Pro tự ghép `?page=1,2,3`), đọc lần
   lượt độc lập, không áp `actions`. 1 URL lỗi không chặn URL còn lại — ghi rõ `--- Trang N: <url> — LỖI:
   ... ---` trong nội dung thay vì fail cả lô.
2. **`pagination.mode="click_next"`** + `next_selector` — bấm nút/link Next lặp lại tới `max_pages`
   (mặc định 5, tối đa 20). Click lỗi (hết nút Next / đã disabled) → dừng êm, coi là đã hết trang chứ
   KHÔNG phải lỗi (trả kết quả các trang đã đọc được, không trả `error`).
3. **`pagination.mode="infinite_scroll"`** — cuộn xuống đáy lặp lại, tự dừng khi `innerText` không dài
   thêm sau 1 lần cuộn (đã tải hết) hoặc chạm `max_scrolls` (mặc định 6, tối đa 20).

Nội dung nhiều trang cắt theo 2 tầng: mỗi trang tối đa `MULTI_PAGE_CHARS=8000` ký tự, tổng toàn bộ tối đa
`TOTAL_CONTENT_CHARS=60000` — dừng sớm nếu chạm trần tổng (khác mode 1-trang cũ vẫn giữ nguyên trần
`15000`). **Timeout co giãn theo số bước** (`computeOverallTimeout`): `20s + 8s × số trang/scroll dự kiến`,
trần 180s — đủ cho tới 20 bước mà vẫn chừa ngân sách cho phần hội thoại còn lại trong giới hạn
`maxDuration=300s` của route Gấu Pro.

`actions` (click/fill/scroll/wait, tối đa 8) giờ chỉ áp dụng **1 lần** ngay sau khi load trang ĐẦU TIÊN —
dùng để đóng cookie banner/điền filter trước khi bắt đầu đọc hoặc phân trang; không áp cho từng URL trong
`urls[]` (mỗi URL độc lập, giữ đơn giản).

Test `browser-tool.test.ts` mở rộng đủ 3 mode (urls[] thành công + 1 URL lỗi giữa chừng, click_next dừng
sớm khi hết nút Next, infinite_scroll dừng khi hết nội dung mới). tsc + lint (0 lỗi mới) + vitest
(212/212) PASS.

## § Gấu Pro s196+5 (2026-09-13) — fix lỗ hổng bảo mật: querySupabase không gate bảng nhạy cảm theo quyền

Phát hiện qua audit toàn diện Gấu Pro (đọc trực tiếp code, không đoán). `creator/tools/supabase.ts →
runQuerySupabase()` cho MỌI user Gấu Pro (kể cả `gp_allowed_users` non-creator, multi-tenant từ s195+3)
quyền query bất kỳ bảng nào trong `ALL_TABLES = SUPABASE_TABLES + SENSITIVE_TABLES` — **không có bước
kiểm tra role nào**, khác hẳn `data-explorer.ts` (dùng cho Bé Gấu) vốn đã có sẵn gate đúng vấn đề này
(`isPrivileged(role)`). Hậu quả thật: bất kỳ nhân viên nào được cấp Gấu Pro có thể hỏi thẳng
`querySupabase(table:"app_settings", filters:[{column:"key",op:"eq",value:"lark_oauth_creator"}])` và đọc
được token Lark cá nhân của Hiếu, hoặc đọc `conversations`/`chat_messages` của người khác (kể cả hội
thoại riêng của Hiếu với Gấu Pro).

**Fix**: `dispatchTool()` (`creator/tools/dispatch.ts`) nhận thêm `ctx.isCreator` (thread cùng cách
`username` đã được thread ở s195+3) → `runQuerySupabase(args, isCreator)` và `listSupabaseTables` chỉ
cho thấy/truy vấn `SENSITIVE_TABLES` khi `isCreator===true`; non-creator hỏi bảng nhạy cảm nhận lỗi rõ
ràng thay vì im lặng trả data. `runCreatorAI()` truyền `isCreator` vào ctx (đã có sẵn biến, trước chỉ
dùng cho `buildFunctionDeclarations`). System prompt sửa câu "you have full admin access" (sai với
non-creator) thành mô tả đúng 2 trường hợp. Bé Gấu (`data-explorer.ts`) không đổi gì — vốn đã đúng từ
trước, dùng làm tham chiếu khi fix.

tsc + lint (0 lỗi mới) + vitest (220/220) PASS. Không cần Hiếu chạy migration nào (không đổi schema).
**Cần Hiếu**: nếu đã từng cấp Gấu Pro cho ai qua `gp_allowed_users` trước s196+5, cân nhắc tự kiểm tra lại
xem họ có từng hỏi những câu dạng "liệt kê app_settings"/"đọc conversations của..." hay không (log cũ nằm
trong lịch sử hội thoại Supabase `conversations`/`chat_messages`, agent_id=`gau_pro`).

## § Gấu Pro s196+6 (2026-09-13) — Nhật ký hành động (audit trail)

Đề xuất "B" trong roadmap Gấu Pro (audit toàn diện s196+5) — từ s195+2 mọi hành động ghi (bridge
browser, Lark, KB) chạy Auto không cần duyệt, không có nơi xem lại "Gấu Pro đã làm gì".

- Bảng mới `gp_action_log` (migration `v57_gp_action_log.sql`) — ghi mọi lời gọi tool có tác dụng phụ
  ra ngoài: `writeKnowledgeBase`, `approveLearning`, `rejectLearning`, `createLarkTask`, `updateLarkTask`,
  `sendLarkMessage`, `controlMyBrowser`, `managePortalCredentials` (`AUDITED_TOOLS` trong
  `creator/tools/dispatch.ts`). Không ghi tool chỉ đọc (executeSQL/querySupabase/readMyBrowser/...).
- `dispatchTool()` tách thành `dispatchToolCore()` (logic cũ, không đổi) + wrapper `dispatchTool()` mới
  gọi `logGpAction()` (`creator/tools/audit-log.ts`) SAU khi có kết quả — **await, không fire-and-forget**
  (đúng bài học s195+18-C: serverless có thể đóng execution context giữa vòng lặp tool-call cuối trước khi
  insert kịp gửi). Args bị redact field `password/secret/token/auth_header/api_key` trước khi lưu (tránh
  `managePortalCredentials` ghi lộ mật khẩu portal vào log).
- Route mới `GET /api/creator-ai/action-log` — **chỉ creator** (oversight toàn bộ user, không phải dữ
  liệu riêng người gọi — khác mọi route bridge multi-tenant khác trong hệ thống).
- UI: nút "🗂 Nhật ký" trong header trang Gấu Pro (chỉ hiện cho creator) mở panel xem 100 hành động gần
  nhất (tool, username, thành công/lỗi, tóm tắt, thời gian).

tsc + lint (0 lỗi mới) + vitest (220/220) PASS. **Cần Hiếu**: chạy migration v57.

## § Gấu Pro s196+7 (2026-09-13) — Cost dashboard riêng Gấu Pro

Đề xuất "D" trong roadmap audit s196+5 — Gấu Pro trước đây KHÔNG ghi `app_usage_events` cho bất kỳ lượt
chat nào (khác Bé Gấu vốn ghi mỗi lượt) → Usage Analytics không thấy Gấu Pro có hoạt động gì, và không
ai biết chi phí Gemini thật.

- `lib/agents/gemini-pricing.ts` — giá `gemini-3.8-flash` **verify trực tiếp** `ai.google.dev/gemini-api/
  docs/pricing` (2026-09-13, không đoán): $0.75/1M token input, $3.75/1M output (gồm thinking tokens),
  áp dụng tới 2026-12-31 — sau đó tăng $1.5/$7.5, cần cập nhật hằng số nếu còn dùng model này.
- `runCreatorAI()` (`creator-ai.ts`) tích luỹ `usageMetadata.promptTokenCount`/`candidatesTokenCount` qua
  **mọi** vòng gọi `genWithRetryStream` (mỗi vòng = 1 request Gemini tính phí riêng, dù `contents` chồng
  lấn) — trả thêm `tokensIn`/`tokensOut` trong response.
- `api/creator-ai/chat/route.ts` — sau khi có kết quả, **await** insert `app_usage_events`
  (`event_type:"chat", agent_id:"gau_pro"`, kèm `user_message`/`ai_response` giống Bé Gấu để Usage
  Analytics tab "Chatbot" cũng thấy được Gấu Pro, + `tokens_in`/`tokens_out`/`est_cost_usd`). Migration
  `v58_app_usage_events_cost.sql` thêm 3 cột.
- UI: `analytics/creator/usage` (Usage Analytics) thêm KpiCard thứ 6 "Chi phí Gấu Pro (kỳ)" — tổng $
  + số lượt + tổng token in/out trong khoảng thời gian đang xem (client tự tính từ `chats` đã fetch, lọc
  `agent_id==="gau_pro"` — không cần route mới).

tsc + lint (0 lỗi mới) + vitest (220/220) PASS. **Cần Hiếu**: chạy migration v58. Bé Gấu chưa track chi
phí (ngoài scope đề xuất — "riêng Gấu Pro"), có thể làm sau nếu muốn.

## § Gấu Pro s196+8 (2026-09-13) — Digest chủ động buổi sáng (proactive layer bước đầu)

Đề xuất "E"/ý tưởng #1 trong roadmap audit s196+5 — Gấu Pro trước đây 100% phản ứng theo lượt, không tự
khởi xướng gì (khoảng cách lớn nhất với hình mẫu "trợ lý toàn năng"/Astra).

- Cron mới `/api/cron/gau-pro-digest` (`45 2 * * *` = 09:45 ICT, sau prewarm 09:00 + b2c-report 09:30 để
  dữ liệu đã ấm) — gọi thẳng `runCreatorAI([], DIGEST_PROMPT, ..., isCreator:true, username:"cron")`, tận
  dụng nguyên bộ tool + business-rule self-validate sẵn có (không viết SQL riêng). Prompt cố định: doanh
  thu hôm qua (tổng + B2B/B2C, so hôm trước), bất thường nếu có — không bịa nếu không có gì lạ.
  `alertCronFailure("gau-pro-digest", err)` khi lỗi (đồng bộ pattern mọi cron khác).
- Gửi kết quả qua `sendLarkDM()` tới `getCreatorLarkOpenId()` — helper MỚI tách vào `lib/lark.ts` (chuỗi
  fallback env→app_settings→users vốn bị chép lại y hệt ở `learning.ts`/`lark-scan-runner.ts`/
  `ca-thread-remind`, nay có 1 bản dùng chung cho code path mới — 3 chỗ cũ CHƯA đổi, ngoài scope).
- `vercel.json`: thêm `maxDuration:120` + 1 cron entry (project giờ 10 cron, vẫn 1x/ngày/job đúng giới
  hạn Hobby).

tsc + lint (0 lỗi mới) + vitest (220/220) PASS. **Cần Hiếu**: không cần làm gì (không migration, dùng
`CRON_SECRET` đã có) — chờ 09:45 ICT ngày mai xem tin nhắn Lark DM đầu tiên, hoặc tự trigger tay:
`curl -H "Authorization: Bearer $CRON_SECRET" https://stg-intel-v2.gohub.cloud/api/cron/gau-pro-digest`.

## § Gấu Pro s196+9 (2026-09-13) — Tự phát hiện học liệu từ chính Hiếu

Đề xuất "5" trong roadmap audit s196+5 — nghịch lý phát hiện lúc audit: `lib/agents/learning.ts` (self-
learning tự động) đã có sẵn cho Bé Gấu + Gấu Tổ nhưng LOẠI TRỪ đúng creator (`role==="creator") return`
sớm) — người dùng chính Gấu Pro lại là người bot "không tự học từ", phải tự gõ "nhớ giúp tôi X" mới có
tác dụng.

**Quyết định thiết kế (lệch nhẹ so cách phác thảo ban đầu trong roadmap)**: KHÔNG tái dùng hàng đợi
`chatbot_learning_log`/`reviewPendingLearning`/`approveLearning` — hàng đợi đó thiết kế cho lời NGƯỜI
KHÁC (staff/CS...) cần Hiếu duyệt lại trước khi tin. Lời của chính Hiếu vốn đã là nguồn xác thực (creator
= authoritative), bắt Hiếu "duyệt lại lời của chính mình" là vòng lặp thừa. Thay vào đó tận dụng đúng
workflow confirm-first CÓ SẴN (`writeKnowledgeBase`, PROPOSE→WAIT confirm→execute) — chỉ thêm 1 đoạn
prompt mới trong `SYSTEM_PROMPT` (`creator-ai.ts`, mục "Proactive learning detection"): model tự đánh giá
NGAY TRONG câu trả lời — nếu Hiếu vừa nhắc thông tin mới có giá trị lâu dài mà không yêu cầu lưu rõ ràng,
thêm 1 dòng cuối đề xuất "muốn mình lưu vào KB không?"; Hiếu xác nhận ở lượt sau → coi như bước 1 của
workflow cũ, chạy tiếp bình thường. Không cần LLM call thứ 2 (model chính đã đọc toàn bộ ngữ cảnh hội
thoại, đánh giá rẻ hơn và có bối cảnh tốt hơn 1 classifier tách biệt), không cần bảng/route mới.

Đây là thay đổi PROMPT-ONLY — không có test tự động khả thi cho hành vi LLM (giống mọi thay đổi
SYSTEM_PROMPT khác của Gấu Pro). tsc + lint (0 lỗi mới) + vitest (220/220) PASS (không đổi code logic).
**Cần Hiếu QA thủ công**: trong 1 hội thoại Gấu Pro, nhắc 1 thông tin mới kiểu "à, giá NCC X giờ đổi
thành Y" mà KHÔNG nói "nhớ giúp tôi" — xác nhận Gấu Pro có tự đề xuất lưu ở cuối câu trả lời không, và
KHÔNG đề xuất khi chỉ hỏi câu bình thường (tránh làm phiền mỗi tin nhắn).

## § Gấu Pro s196+10 (2026-09-13) — Text-to-speech đọc câu trả lời

Ý tưởng #6 trong roadmap audit s196+5 — "bước đệm rẻ" về phía voice 2 chiều thật (idea #10 trong cùng
roadmap bị đánh giá "chưa nên" vì effort cao/ROI thấp lúc này). Đối xứng với mic input 1 chiều đã có
(Web Speech API `SpeechRecognition`), dùng `SpeechSynthesisUtterance` (Web Speech API, cùng họ, không
cần thư viện/hạ tầng mới).

- Nút loa 🔊 cạnh `ExportBar` mỗi tin nhắn trợ lý — bấm đọc to, bấm lại dừng (chỉ 1 tin đọc cùng lúc,
  bắt đầu tin mới tự `speechSynthesis.cancel()` tin đang đọc dở).
- `stripForSpeech()` (page.tsx) — bỏ code block/bảng markdown/ảnh/ký hiệu `#*_~` trước khi đọc (đọc
  nguyên markdown ra sẽ đọc cả ký hiệu, vô nghĩa).
- Feature-detect qua `useEffect` (giống `voiceSupported`) — ẩn nút hoàn toàn nếu browser không hỗ trợ.
- Cancel khi unmount trang (tránh giọng đọc tiếp tục chạy sau khi rời trang).

Chỉ Gấu Pro (chưa merge Bé Gấu — theo đúng phạm vi đề xuất, có thể làm sau nếu Hiếu muốn). tsc + lint
(0 lỗi mới) + vitest (220/220) PASS. **Cần Hiếu QA thủ công trên staging**: bấm nút loa 1 tin nhắn dài,
xác nhận đọc đúng tiếng Việt + bấm lại dừng được + không đọc lẫn ký hiệu markdown.

## § Gấu Pro s196+11 (2026-09-13) — Eval harness (đề xuất C, roadmap audit s196+5)

Gấu Pro trước đây KHÔNG có bộ eval nào — dù prompt 754 dòng + 32 tool phức tạp hơn Bé Gấu nhiều, mọi thay
đổi prompt/tool chỉ xác nhận bằng tsc + cảm nhận cá nhân, dễ regress âm thầm. 2 lớp bổ sung:

**(1) Unit test deterministic** (chạy trong suite bình thường, không cần .env.local) —
`src/__tests__/gau-pro-security.test.ts` (8 case) — regression guard riêng cho fix P0 s196+5
(`querySupabase` không gate bảng nhạy cảm): mock `supabaseAdmin` + `data-explorer` table lists, xác nhận
`visibleTables`/`runQuerySupabase`/`dispatchTool` chặn đúng non-creator đọc `app_settings`/`conversations`
và vẫn cho creator đọc bình thường. Đây là lưới an toàn RẺ NHẤT, chạy mỗi lần `npx vitest run` — nếu ai
lỡ sửa lại logic gate này, test đỏ ngay lập tức (khác LLM-judge dưới, vốn cần chạy tay + tốn Gemini call).

**(2) LLM-judge live-DB harness** (port thẳng pattern `agent-grade.test.ts` của Bé Gấu, cần GEMINI_KEY +
SUPABASE_* + ANALYTICS_DB_* thật — máy dev không chạy được) — `src/__e2e__/gau-pro-banks.ts` (10 case,
tái dùng type `BankCase` từ `agent-banks.ts` — không có `expectAgent`/routing vì Gấu Pro chỉ 1 agent) +
`src/__e2e__/gau-pro-grade.test.ts` (gọi thẳng `runCreatorAI()`, không qua router/guardian vì Gấu Pro
không có 2 lớp đó). Bank phủ: SQL/BI, Supabase, KB, export marker, business-rule self-validation
(Internal-Transaction), VÀ 2 case bảo mật P0 (role `staff` hỏi bảng nhạy cảm phải bị từ chối — cùng bug
vừa fix ở (1) nhưng qua đường LLM thật thay vì gọi thẳng hàm, bắt được cả trường hợp model "quên" tuân
system prompt dù code đã chặn đúng). Wired vào `vitest.audit.config.ts`.

tsc + lint (0 lỗi mới) + vitest thường (228/228, +8 so trước) PASS. **Cần Hiếu**: chạy layer (2) 1 lần để
xác nhận baseline hiện tại (không có credentials trên máy dev nên chưa tự chạy được):
`npx vitest run --config vitest.audit.config.ts src/__e2e__/gau-pro-grade.test.ts --disableConsoleIntercept`.
Chạy lại mỗi khi sửa `SYSTEM_PROMPT`/thêm tool lớn để bắt regression sớm — đúng mục đích đề xuất C.

## § Gấu Pro s196+12 (2026-09-13) — Second-opinion pass + Quét vendor quote định kỳ + quyết định #9

Làm nốt 3 ý "thử nghiệm giới hạn" còn lại trong roadmap audit s196+5.

### #7 — Second-opinion pass cho báo cáo quan trọng
Tool mới `verifyReportNumbers(summary, sql?)` (`creator/tools/self-review.ts`) — 1 lượt Gemini ĐỘC LẬP
(không thấy lịch sử hội thoại/tool-call, chỉ thấy summary+SQL đưa vào) phản biện tìm rủi ro cụ thể (JOIN
nhân dòng, thiếu cutoff, nhầm đơn vị, số phi thực tế, quên exclude tài khoản nội bộ...). System prompt
(mục "Report depth") hướng dẫn gọi tool này TRƯỚC KHI trả lời cuối cho báo cáo có số liệu QUAN TRỌNG —
không gọi cho câu hỏi nhỏ (thêm 1 lượt Gemini = thêm cost/latency, đúng cảnh báo trong roadmap). 33 tool
declarations (từ 32).

### #8 — Quét vendor quote định kỳ
Cron mới `/api/cron/vendor-quote-scan` (`15 3 * * *` = 10:15 ICT). **Quyết định kỹ thuật quan trọng**:
KHÔNG tự viết parser JSON cho từng vendor (không có quyền truy cập/test schema thật của SunSpeedy/
UHUIBAO lúc code — đoán schema rồi so giá tự động là đúng rủi ro roadmap đã cảnh báo "dễ lỗi âm thầm,
không được báo 'không có chênh lệch' giả"). Thay vào đó giao HẲN cho Gấu Pro tự làm qua tool sẵn có
(`managePortalCredentials` list → `browsePortal` đọc → `querySupabase` so COGS), với rào chắn RÕ trong
prompt: chỉ so sánh khi nhận diện được cấu trúc giá THẬT RÕ RÀNG, ngược lại phải nói thẳng "không đọc
được cấu trúc giá" — KHÔNG bịa số. Chỉ nhắm 1 portal ổn định nhất (SunSpeedy/UHUIBAO/cardweb, đã tự động
hoá login CAPTCHA tốt) — nếu Hiếu chưa cấu hình portal đó trên môi trường đang chạy, cron tự bỏ qua êm
(không DM), không báo lỗi giả. Chỉ DM Lark khi có kết quả thật (skip cả trường hợp "bỏ qua"/"không đọc
được" để tránh spam Lark mỗi ngày).

### #9 — Bridge đọc màn hình mở rộng có kiểm soát: KHÔNG đổi code
Đánh giá lại theo đúng kết luận đã ghi trong roadmap: giữ NGUYÊN mô hình "đọc khi được hỏi" hiện tại
(`readMyBrowser`/`controlMyBrowser`, s195+1/+3) — KHÔNG chuyển sang polling/ambient nền liên tục (rủi ro
riêng tư tăng mạnh, chưa có nhu cầu cụ thể nào đòi hỏi). Đây là quyết định "không code" chủ đích, không
phải bỏ sót.

tsc + lint (0 lỗi mới) + vitest (230/230, +2 test cho verifyReportNumbers) PASS. **Cần Hiếu**:
(1) QA thủ công #7 — hỏi 1 báo cáo số liệu lớn, xem Gấu Pro có tự gọi verifyReportNumbers không (status
"🔍 Đang kiểm tra lại số liệu..." sẽ hiện). (2) #8 cần đã cấu hình portal SunSpeedy/UHUIBAO qua
`managePortalCredentials` từ trước — nếu chưa, cron sẽ tự báo "bỏ qua" mỗi ngày (không DM), không lỗi gì
cần fix; nếu ĐÃ cấu hình, theo dõi vài ngày xem nội dung DM có đúng/hữu ích không, đặc biệt để ý câu
"không đọc được cấu trúc giá" — nếu LUÔN ra câu đó, nghĩa là path `/sim/simmanage/page` không phải nơi có
giá gói thật, cần Hiếu cho biết path đúng (F12 Network khi xem giá trên portal) để sửa prompt.

## § Bridge s202 (2026-09-20) — Ghi nhận thiết bị để truy vết

Hiếu: khi có người dùng Bridge, cần lưu thông tin máy để nếu có sự cố vẫn truy ra ai làm.

- **Extension 1.1.0** (`browser-extension/`): sinh `deviceId` (UUID, `chrome.storage.local`) cố định mỗi máy/profile; gửi header `X-Device-Id` mọi request và `X-Device-Info` (base64 JSON: OS, arch, UA, phiên bản Chrome/extension, múi giờ, ngôn ngữ, số nhân CPU, RAM, email tài khoản Chrome qua `identity.email`) 1 lần mỗi lần service worker khởi động. Popup có dòng thông báo minh bạch. **Chrome extension KHÔNG đọc được tên máy tính** — dùng device ID + OS + email Chrome + IP thay thế.
- **Server** (`lib/bridge-device.ts` `authBridge()`): token → username, `X-Device-Id` bắt buộc (thiếu → 400 `extension_outdated`, nghĩa là bản extension cũ bị từ chối tới khi reload), thiết bị `revoked` → 403; poll thì upsert `browser_bridge_devices` (thông tin + `last_ip` từ `x-forwarded-for` + `last_seen`). Lệnh được nhận (`claim`) gắn `device_id` + `claimed_ip` → biết chính xác máy/IP nào chạy lệnh nào.
- **DB** (migration `v61_browser_bridge_devices.sql`): bảng `browser_bridge_devices` (unique `username+device_id`), cột `browser_bridge_commands.device_id/claimed_ip`. Nhớ Reload schema Supabase sau khi chạy.
- **UI + quyền** (`/analytics/creator/bridge`, `bridge-devices.tsx`): **thông tin thiết bị + nhật ký lệnh CHỈ creator xem/sửa — admin cũng không** (Hiếu chốt 2026-09-20). API `GET/PATCH /api/creator-ai/bridge/devices` gate `requireCreator()` bằng role DB hiện tại (`getDbRole`, không tin JWT cũ) → 403 với mọi role khác; test `bridge-devices-route.test.ts`. Creator có nút Thu hồi/Khôi phục và chế độ "Toàn bộ user + nhật ký lệnh" (giờ, user, lệnh + tóm tắt payload, máy/IP, trạng thái). User khác chỉ thấy dòng thông báo minh bạch rằng thiết bị/nhật ký được ghi nhận (extension popup cũng có), không thấy dữ liệu nào.
- Bổ sung cho `gp_action_log` (s196+6, ghi tool Gấu Pro gọi) — bảng này thêm phần "máy nào".
- Thu hồi thiết bị = chặn theo `device_id` (token vẫn dùng chung cho mọi máy của cùng user; muốn chặn hẳn user thì tạo token mới).

### Bé Gấu (chatbot team) — s131

Từ s131, Bé Gấu chuyển sang `be-gau.ts` (single function-calling agent, không còn pipeline 6-agent):
- 1 vòng lặp ≤12 iterations, Gemini tự chọn tool
- Tools: executeSQL (gohub_dw), querySupabase, queryProduct, webSearch, readKnowledgeBase, queryGA4, queryGSC
- Guardian pre-flight vẫn giữ ở route level
- Legacy pipeline (router/graph/orchestrator/agents) giữ file nhưng không còn là luồng chính

## § Gấu Pro s206 (2026-09-23) — `localFiles`: đọc/sửa file trên máy creator qua daemon local (P3 trợ lý toàn diện)

Bước P3 của lộ trình "trợ lý toàn diện" (cloud làm não + local làm tay chân). Gấu Pro chạy trên Vercel nên không
chạm được ổ đĩa → thêm daemon `local-agent/daemon.mjs` (Node thuần, không dependency) chạy trên máy creator.

- **Hàng đợi**: dùng lại `browser_bridge_commands` (KHÔNG migration) — lệnh file có action tiền tố `fs_`
  (`fs_list/fs_read/fs_write/fs_edit`). `bridge/next` tách luồng theo header `X-Agent-Kind: local`: daemon chỉ nhận
  `fs_*`, extension Chrome (không gửi header) không bao giờ nhận `fs_*`. Auth = token Bridge của user + `X-Device-Id`
  riêng (daemon hiện trong danh sách thiết bị ở `/analytics/creator/bridge`, thu hồi được).
- **Tool `localFiles`** (`creator/tools/bridge.ts` → `runLocalFiles`): creator-only (`CREATOR_ONLY_TOOLS` + chặn lại
  trong dispatch), ghi audit `gp_action_log`. Prompt tool bắt nói rõ file/thay đổi và chờ đồng ý trước write/edit.
- **An toàn phía daemon**: chỉ trong `roots` (config), chặn `..`/symlink ra ngoài, `.git`/`node_modules`, file bí mật
  (`.env*`, key/pem, `secret`, `credentials`) — không bao giờ gửi lên cloud. Backup trước mỗi lần ghi vào
  `%USERPROFILE%\.gohub-agent\backups`. Không có xoá. Text ≤256KB, file nhị phân chưa hỗ trợ.
- Config/token ở `%USERPROFILE%\.gohub-agent\config.json` (ngoài repo). Poll 10s rảnh / 2s trong 3' sau lệnh.
- ⚠️ Thứ tự deploy: daemon chỉ được chạy SAU khi server có bản tách luồng `fs_` — server cũ sẽ đưa lệnh browser cho daemon.
- Chưa làm: đọc/ghi docx/xlsx, Claude Agent SDK phía local cho việc nhiều bước (chờ API key), duyệt qua Lark.
- **Autostart (s206+1)**: `local-agent/install-autostart.ps1` tạo shortcut Startup + Desktop chạy `start-hidden.vbs`
  (ẩn console). Khoá 1 bản chạy qua `%USERPROFILE%\.gohub-agent\agent.pid`.

## § s206+1 (2026-09-23) — Model Gemini tập trung 1 chỗ + tự báo model mới

- `lib/ai-models.ts`: `GEMINI_MODEL` (mặc định `gemini-3.8-flash`) + `GEMINI_MODEL_PRO` (mặc định = GEMINI_MODEL vì
  bản Pro sẵn có `gemini-3.1-pro-preview` cũ hơn 3.8-flash — kiểm qua API list models 2026-09-23, chưa có gemini-4).
  Override bằng env Vercel cùng tên. Mọi `model: "gemini-3.8-flash"` trong code (21 file) đã chuyển sang hằng số.
- Không tự đổi model (model mới có thể từ chối `thinkingLevel` cũ) → `lib/gemini-model-watch.ts` so danh sách model
  của key với lần trước (`app_settings.gemini_known_models`), cron `gau-pro-digest` DM creator khi có model mới.
  Lần chạy đầu chỉ ghi mốc.
- ⚠️ `gemini-pricing.ts` vẫn cố định giá 3.8-flash — đổi model thì cập nhật giá theo.
- Hiếu chốt 2026-09-23: không dùng Claude API (gói Claude Pro không gồm API, tính tiền theo token riêng) → trợ lý
  toàn diện chạy hoàn toàn trên Gemini.

## § s206+2 (2026-09-23) — Kết nối Google: tool `googleWorkspace` (Drive/Docs/Sheets)

- **OAuth**: client "GoHub Intel - Drive" (GCP project "hieu" của hieuhc07@gmail.com, consent External + In
  production). Redirect `https://{stg-intel-v2|intel-v2}.gohub.cloud/api/google/oauth/callback` (theo origin đang
  truy cập — domain khác sẽ lỗi redirect_uri_mismatch). Env `GOOGLE_OAUTH_CLIENT_ID/SECRET` (Vercel Prod+Preview +
  `.env.local`). Routes `api/google/oauth/{start,callback,status}`, `lib/google-oauth.ts` lưu
  `app_settings.google_oauth_creator` (access + refresh, tự refresh; Google chỉ trả refresh_token lần consent đầu →
  giữ refresh cũ khi refresh). `prompt=consent` + `access_type=offline`. Scope `drive` (đọc/sửa toàn bộ Drive).
  App chưa verify → lần đầu Google hiện "Google chưa xác minh ứng dụng này" → Nâng cao → Đi tới (an toàn, app của mình).
- **Tool `googleWorkspace`** (creator-only, audit): search · read (Doc → markdown qua export, Sheet → values, file
  text) · create_doc (upload markdown → Drive tự convert thành Doc) · append_doc · replace_in_doc · create_sheet ·
  write_sheet · append_sheet. REST thẳng, không thêm SDK `googleapis`. Tạo mới làm luôn, sửa file có sẵn phải hỏi.
- UI: badge "📁 Kết nối Google" / "Đã kết nối Google" cạnh badge Lark ở header Gấu Pro.

## § s206+3 (2026-09-23) — P1 trợ lý: task Lark từ DM/group + nhắc deadline

- **DM creator → Gấu Pro**: `api/lark/events` — role `creator` + `chat_type=p2p` đi `replyCreatorDM()` → `runCreatorAI`
  (đủ tool, username thật để dùng localFiles/Bridge) thay vì Bé Gấu. Directive kèm giờ VN hiện tại: tin nhắn là ghi
  chú việc/nhắc nhở → tự `createLarkTask` rồi xác nhận ngắn. Người khác DM vẫn đi Bé Gấu như cũ. Log `agent_id=gau-pro`.
- **Group @creator → task**: tin group có mention open_id creator (người gửi ≠ creator) → `detectGroupTask()`
  (`lib/task-assistant.ts`): Gemini JSON phân loại có phải giao việc + tóm tắt + hạn → tạo Lark Task (mô tả kèm người
  giao + trích tin) → DM creator "📌 Đã tạo task từ group". Dedupe `larkevt:grptask:<messageId>`. Nội dung tin chỉ là
  dữ liệu (prompt bọc `<msg>`, bỏ qua lệnh bên trong). ⚠️ Bot chỉ nhận tin KHÔNG @bot khi app Lark có scope
  `im:message.group_msg` (+ publish version) và bot đã ở trong group.
- **Nhắc deadline**: `runTaskReminders()` ké cron `scheduled-messages` (cron-job.org gọi mỗi phút) qua `waitUntil`, tự
  giới hạn 10'/lần (`app_settings.task_reminder_last_run`). Task chưa xong: còn ≤60' → nhắc 1 lần; quá hạn → nhắc 1
  lần/ngày (`task_reminder_state`). Cần user token Lark (Kết nối Lark); chưa kết nối thì bỏ qua im lặng.
- **Digest sáng** thêm mục 3: task hạn hôm nay + quá hạn (qua `listLarkTasks`).
- **Bug có sẵn đã sửa**: `createLarkTask`/`updateLarkTask` gửi `due.timestamp` theo GIÂY — Lark Task v2 dùng MILI giây
  (docs: "距1970-01-01 00:00:00 UTC的毫秒数") → mọi hạn tạo qua Gấu Pro từng rơi về 01/1970. `dueMs()` sửa + chuỗi giờ
  không kèm múi giờ hiểu là giờ VN (server UTC). Test `lark-task-due.test.ts`, `task-reminders.test.ts`.

## § s206+4 (2026-09-23) — Trí nhớ dài hạn riêng cho trợ lý (`assistantMemory`)

- Bảng `assistant_memory` (migration **v63**, Hiếu phải chạy): `username, kind (profile|preference|project|person|
  decision|other), content ≤500, source, pinned, archived`. RLS bật, không policy → chỉ service_role.
- **Tách khỏi `creator_kb`** có chủ đích: creator_kb là kiến thức nghiệp vụ và `readKnowledgeBase` mở cho MỌI role →
  lưu điều riêng tư về Hiếu vào đó là lộ.
- `lib/assistant-memory.ts`: `buildMemoryBlock(username)` nạp vào system prompt Gấu Pro **mỗi lượt** (khác KB chỉ lượt
  đầu), ưu tiên ghim rồi mới cập nhật, trần 4.000 ký tự, có id `[#id]` để model update/forget đúng mục. Khối kèm quy
  tắc khi nào lưu / không lưu. Chưa chạy migration → khối rỗng, chat không hỏng; tool báo cách sửa.
- Tool `assistantMemory` (creator-only, audit): save · update · forget (= archive, khôi phục được bằng SQL) · list.
  Áp dụng cả web lẫn Lark DM (cùng `runCreatorAI` + username). Cron (digest, `username="cron"`) không nạp trí nhớ.
- Test `assistant-memory.test.ts`.

## § s206+5 (2026-09-23) — Fix Lark OAuth (đá sang production + token thiếu quyền task) + 2 lỗi QA

- **Kết nối Lark từ staging bị chuyển sang production**: start/callback lấy base từ `NEXTAUTH_URL` — biến này trên
  Preview trỏ production. Nay dùng `req.nextUrl.origin` (cả 2 domain đã đăng ký redirect trong Lark Security Settings).
- **Token thiếu `task:task:read/write` dù app đã bật scope** (Lark `99991679`): authorize không truyền `scope` → theo docs
  Lark "không xin thêm quyền nào" (và thiếu `offline_access` thì không có refresh_token). Nay truyền tường minh
  `offline_access task:task:read task:task:write task:tasklist:read` (override env `LARK_OAUTH_SCOPES`). Chỉ liệt kê scope
  app ĐÃ bật + publish — sai 1 cái Lark báo lỗi ở màn authorize (gotcha cũ "bỏ scope để tránh thiếu quyền" là do lúc đó
  sai tên scope). Quyền cộng dồn qua các lần cấp nên không mất quyền cũ (gửi tin Cà Thread).
- Badge "Đã kết nối Lark/Google" giờ bấm được = cấp quyền lại (trước không có đường re-auth khi app thêm quyền).
- **"Cuộc trò chuyện mới" bị đè**: không có localStorage → auto-load cuộc gần nhất qua 2 fetch; bấm "mới"/gửi tin trong
  lúc đó thì bản tải về sau đè lên, tin vừa gõ mất. `userActedRef` huỷ auto-restore khi người dùng đã thao tác.
- **Đi lạc khi tool lỗi**: gặp `99991679` Gấu Pro gọi thêm Lark Base, đọc browser Hiếu, Supabase. System prompt thêm mục
  "When a tool returns an error": lỗi quyền/kết nối/config → dừng, báo lỗi + cách sửa, không gọi tool không liên quan.

## § s206+6 (2026-09-23) — QA sống P1 + trí nhớ

- Trí nhớ: lưu 2 mục → cuộc trò chuyện mới liệt kê đúng → forget #2 → DB `archived=true`. Web và Lark DM chung
  username (`users.username` theo `lark_open_id`) nên chung kho trí nhớ.
- Lark Task: list OK (task hiện có đa số chỉ có start, không due) · create hạn `2026-09-25 15:00` → `due.timestamp`
  `1790323200000` = 08:00 UTC = 15:00 VN (đúng mili giây + giờ VN) · update complete OK.
- Nhắc deadline chạy thật lần đầu 22:01 VN: quét 23 task mở, task test hạn 22:21 → `soon=true` (đã DM).
- ⚠️ **Thực tế cron-job.org gọi `/api/cron/scheduled-messages` MỖI GIỜ (phút :01), không phải mỗi phút**, và đang trỏ
  **staging** (log Vercel 2026-09-23). Nên nhắc "sắp tới hạn" tới trong khoảng 0–60' trước hạn (mỗi task 1 lần), cổng
  10' trong code chỉ là phòng hờ. Cả 2 môi trường dùng chung Supabase nên 1 nơi chạy là đủ; muốn nhắc sát hơn thì
  tăng tần suất job ở cron-job.org (không cần sửa code).
- "Cuộc trò chuyện mới" bị đè: sau fix không tái hiện lại được lỗi gốc (trang không tự khôi phục cuộc cũ khi mở mới).
  Các lần lỗi trước nhiều khả năng do extension Chrome khác chặn công cụ điều khiển trình duyệt ("Cannot access a
  chrome-extension:// URL of different extension") — fix `userActedRef` vẫn giữ vì đúng về logic.

## § s206+7 (2026-09-23) — Tool `larkDocs`: tìm/đọc/tạo/ghi tài liệu Lark (Drive, Docs, Sheets, Wiki)

- `lib/agents/creator/tools/lark-docs.ts`, creator-only, audit, dùng user token Lark của creator (thấy đúng những gì
  tài khoản đó thấy). Actions: search (`POST /suite/docs-api/search/object`) · read (docx `raw_content`; sheet
  `sheets/v2 values`; link wiki → `wiki/v2/spaces/get_node` ra tài liệu thật) · create_doc (tạo docx rồi markdown →
  `docx/v1/documents/blocks/convert` → chèn `…/descendant` theo lô ≤1000 block, bỏ `merge_info` của bảng — docs
  bắt buộc) · append_doc · create_sheet · write_sheet · append_sheet. Link lấy qua `drive/v1/metas/batch_query`.
- Nhận link dán thẳng (`/docx/`, `/sheets/`, `/wiki/`) hoặc token (`parseLarkRef`, test `lark-docs.test.ts`).
- OAuth start xin thêm `drive:drive docx:document docx:document.block:convert sheets:spreadsheet wiki:wiki`. Scope app
  chưa bật chỉ hiện "không thể cấp" trên màn authorize, không chặn scope khác. Sau khi app thêm quyền → bấm badge
  "Đã kết nối Lark" cấp quyền lại. Lỗi 99991679 → tool tự nhắc bước này.
- **QA sống larkDocs (2026-09-23, staging, sau khi cấp quyền lại 22:52)**: search "báo cáo" ra 5 tài liệu thật (sheet +
  docx) · read docx (tóm tắt đúng nội dung) · create_doc → Doc có H1, đoạn, bullet, bảng thật 2×4 (mở bằng trình duyệt
  kiểm) · create_sheet + read lại đúng 4 dòng. Link dạng `https://esimgohub.sg.larksuite.com/{docx|sheets}/<token>`.
  Lưu ý: số truyền dạng chuỗi có định dạng ("1.072.572.881 ₫") vào Sheet thành TEXT (không tính toán được) — muốn tính
  thì truyền số thuần.

## § s207 (2026-09-24) — Fix lag UI Gấu Pro khi hội thoại dài

Hiếu báo nhắn nhiều thì Gấu Pro lag. Nguyên nhân hoàn toàn phía client (`creator/ai/page.tsx`), mỗi lần render lại
parse markdown TOÀN BỘ hội thoại (`stripLatex` ~60 regex + `ReactMarkdown`) và bị kích hoạt quá dày:
- Danh sách tin không `memo` → mỗi phím gõ (`input`), mỗi giây (`elapsed`), mỗi token stream đều render lại mọi bubble.
- `localStorage.setItem(JSON.stringify(messages))` chạy đồng bộ MỖI token stream.
- `scrollIntoView({behavior:"smooth"})` mỗi token → animation chồng nhau.
- `setMessages` mỗi delta (hàng chục lần/giây).

Fix: `MessageRow = memo(...)` (tin cũ giữ reference nên không render lại; `onFollowup`/`toggleSpeak` ổn định qua ref
`sendRef`/`speakingIdxRef`) · persist localStorage bỏ qua lúc `loading`, ghi 1 lần khi stream xong · cuộn `auto` khi
đang stream, `smooth` khi xong · gộp delta bằng `requestAnimationFrame` (huỷ rAF chờ ở nhánh cuối/lỗi để không đè
nội dung cuối). Không đổi UI/giao diện.
Gotcha: tin ĐANG stream vẫn parse markdown lại mỗi frame — câu trả lời rất dài vẫn có thể nặng; nếu còn giật thì
chỉ render markdown khi stream xong. Lag phía server (chờ chữ đầu) là vấn đề khác, đã có `compressHistory`.

## § s223 G0 (2026-10-05) — Cổng duyệt hành động + chống prompt injection (plan `docs/plans/gau-pro-assistant.md`)

**Vì sao**: cùng 1 lượt Gấu Pro vừa có dữ liệu riêng (SQL, Supabase, Drive, file máy), vừa đọc nội dung không tin cậy (web,
tab Chrome, portal, file tải lên, tài liệu Lark/Google), vừa có kênh gửi ra ngoài ("lethal trifecta"). Trước đây chỉ có lời dặn
trong prompt; `controlMyBrowser` chạy ngay; `sendLarkMessage` mở cho cả user không phải creator, gửi được tới group bất kỳ.

**Mức duyệt (Hiếu giao tự chốt: an toàn + tiện)** — `lib/agents/creator/tool-policy.ts`, chạy TRONG CODE:
- Tool chỉ đọc: chạy luôn.
- `sendLarkMessage` tới group/người khác: LUÔN hỏi. Gửi `me`: chỉ hỏi khi lượt đã "nhiễm".
- Tool ghi/gửi khác (task Lark, KB, trí nhớ, portal credentials, điều khiển browser trừ scroll, ghi file máy, ghi Google/Lark Docs,
  tạo ảnh/video): chạy luôn khi lượt CHƯA nhiễm; đã nhiễm → hỏi.
- "Nhiễm" = trong lượt đã gọi `webSearch`, `browseWeb`, `browsePortal`, `queryLarkBase`, `getTrendSnapshots`, `readMyBrowser read_tab`,
  `larkDocs/googleWorkspace read`, hoặc có file tải lên.
- `browseWeb` sau khi nhiễm chỉ mở URL đã xuất hiện NGUYÊN VĂN trong tin người dùng/kết quả tool trước (chặn nhét dữ liệu vào URL);
  URL mới → hỏi.

**Luồng**: tool cần duyệt KHÔNG chạy → lưu `gp_pending_actions` (migration **v64**, mã ngắn 6 ký tự) → SSE `approval_required`
→ thẻ Duyệt/Từ chối dưới câu trả lời (web) hoặc dòng "🔐 Chờ duyệt #abc123 … gõ 'duyệt abc123'" (Lark DM, ghép bằng code) → model
được báo "đang chờ duyệt, không gọi lại". Người dùng duyệt → `POST /api/creator-ai/approve` (hoặc lệnh Lark) chuyển trạng thái
nguyên tử `pending→approved`, chạy đúng tool + tham số đã lưu qua `dispatchTool` (có audit log), lưu kết quả, rồi gửi câu nối
`[Đã DUYỆT …] Kết quả: …` để Gấu Pro làm tiếp. Hết hạn sau 24h. Chỉ chủ hành động duyệt được.
- **Fail-closed**: chưa chạy v64 → hành động cần duyệt báo lỗi, KHÔNG chạy (gửi Lark tới group sẽ không dùng được tới khi chạy migration).
- Cron (`digest`, `vendor-quote-scan`, kênh `cron`) không có người duyệt → hành động cần duyệt bị từ chối.
- `sendLarkMessage` thêm vào `CREATOR_ONLY_TOOLS` + chặn trong `dispatchTool`.

**Persona theo người dùng (D9)**: phần mở đầu "dành riêng cho Hiếu" + "About Hiếu / mục tiêu Q3" tách ra `CREATOR_INTRO`/
`CREATOR_PROFILE`, chỉ nạp cho creator; user được cấp quyền nhận `MEMBER_INTRO`. Lark DM ghi `agent_id` = `gau_pro` (trước `gau-pro`;
dữ liệu cũ chưa sửa).

**Giới hạn đã biết**: "nhiễm" tính trong 1 lượt — nội dung ngoài đã đọc ở lượt TRƯỚC (nằm trong lịch sử dạng văn bản trả lời) không
làm lượt sau nhiễm. Test: `gp-tool-policy.test.ts` (7 ca).

## § s223 G1a (2026-10-05) — Skills: prompt lõi + hướng dẫn/tool nạp khi cần

- `lib/agents/creator/skills.ts`: 5 skill (`product-ncc`, `content-creative`, `workspace`, `browser-files`, `kb-learning`). Mỗi skill:
  tên + mô tả 1 dòng (luôn nằm trong prompt lõi qua `skillCatalog()`), nhóm tool, hướng dẫn đầy đủ (chép NGUYÊN VĂN các mục cũ:
  Portal, Product Onboarding, Product Intelligence Tools, Image Generation, Content Creator, Image Style Presets, sendLarkMessage),
  regex từ khoá để nạp sẵn.
- Tool `loadSkill(name)`: trả hướng dẫn + bật tool của skill; vòng lặp dựng lại model với bộ tool mới (`activeDeclarations`).
  Nạp sẵn: `preloadSkills(tin mới + câu trả lời gần nhất)` (từ khoá hoặc có nhắc tên tool — câu nối sau khi duyệt hành động tự
  nạp lại skill của tool đó); Lark DM + cron digest nạp sẵn `workspace`, cron quét báo giá nạp sẵn `product-ncc`.
- Đo (ký tự gửi mỗi vòng, chưa nạp skill): prompt 35,5k → ~23k; khai báo tool 28,8k → 7,5k (37 → 13 tool lõi). Tổng ≈ −53%.
- Eval `gau-pro-grade` (máy dev, `.env.local` thiếu mật khẩu DB + key Supabase lỗi → 4 câu cần DB không chấm được ở cả 2 lần):
  câu không cần DB trước 6/6, sau 6/6; thêm 3 câu skill (clip ngắn KHÔNG có từ khoá → model tự `loadSkill`; lên sản phẩm; portal SPA)
  đều 10/10. Câu cần DB phải chạy lại ở môi trường đủ key.
- Thêm skill: thêm 1 phần tử `SKILLS` (tool phải có khai báo; test `gp-skills.test.ts` kiểm không trùng/không thiếu).

## § s223 G1b (2026-10-05) — Gấu Pro chuyển sang SDK `@google/genai`

- SDK cũ `@google/generative-ai` 0.21 hết hỗ trợ từ 30/11/2025 (phải ép `as any` cho `thinkingConfig`, từng rớt `thoughtSignature`
  khi gộp stream). Vòng lặp chính `runCreatorAI` nay dùng `lib/agents/genai-stream.ts` (`streamTurn`: tự gom nguyên part từng chunk,
  giữ `thoughtSignature`, bỏ part `thought` khỏi chữ hiện ra, retry lỗi tạm thời khi chưa đẩy chữ nào; `ThinkingLevel.LOW` có type).
- `declarations.ts` giữ nguyên (Bé Gấu + test dùng chung); `toGenaiSchema()` đổi `type` sang chữ hoa khi đưa vào SDK mới.
- CHƯA chuyển: Bé Gấu (`be-gau.ts` + `gemini-stream.ts`), `compress.ts`, tool phụ (self-review, search, image...) — vẫn SDK cũ, chạy bình
  thường; chuyển dần khi đụng tới.
- Eval sau khi chuyển: 9/13 giống hệt trước (4 câu cần DB không chấm được trên máy dev) — vòng nhiều lượt gọi tool chạy đúng.

## § s223 G2a (2026-10-05) — Kế hoạch hiển thị + nút Dừng

- Tool lõi `updatePlan(steps[{title,status}])` (không chạy gì, không qua dispatch): vòng lặp phát SSE `plan`; web hiện checklist "Kế hoạch
  (x/y)" đầu bubble (`PlanChecklist`, lưu trong `msg.plan`). Prompt lõi: chỉ dùng cho việc ≥3 bước, cập nhật cùng lượt với tool bước sau.
  Thử thật (máy dev): "3 kịch bản TikTok Nhật/Hàn/Thái" → plan 3 bước in_progress → done.
- Nút Dừng (thay nút gửi khi đang chạy): `AbortController` huỷ fetch → route truyền `req.signal` vào `runCreatorAI` → dừng giữa các vòng
  + huỷ request Gemini đang chạy (`abortSignal` của SDK mới); câu trả lời thêm "⏹ Đã dừng theo yêu cầu.". Chưa xác minh trên Vercel việc
  client ngắt có làm `req.signal` abort ngay không (nếu không, server chạy nốt vòng lặp như trước — không hại).
- Lark DM chưa hiện kế hoạch (bỏ qua sự kiện `plan`).

## § s223 G2b+G2c (2026-10-05) — Trace lượt chạy + việc chạy nền + panel "Việc & duyệt"

Migration **v65** (`gp_runs`, `gp_jobs`) — Hiếu phải chạy; chưa chạy thì trace bỏ qua im lặng, giao việc nền báo lỗi kèm hướng dẫn.

**Trace (`gp_runs`)**: mỗi lần `runCreatorAI` ghi 1 dòng cuối lượt (1 insert, không N+1): câu hỏi, kênh, skill đã nạp, `steps`
(mỗi vòng model: thời gian + token + tool được gọi; mỗi tool: thời gian, tham số rút gọn che password/token, lỗi, mã chờ duyệt), tổng
token, thời lượng, kết quả (done/stopped/unfinished). Xem: panel 🗂 Nhật ký → tab "Lượt chạy (trace)" (chỉ creator, `GET /api/creator-ai/runs`).

**Việc chạy nền (`gp_jobs`)** — không dùng Vercel Workflow (gói Hobby, Hiếu chốt không lên Pro):
- Bật nút ⏱ "Nền" cạnh ô nhập → tin gửi đi thành việc (`POST /api/creator-ai/jobs`), KHÔNG kèm lịch sử chat/file.
- Chạy theo chặng: `POST /api/creator-ai/jobs/run` (Bearer CRON_SECRET, trả 202 ngay, làm trong `waitUntil`, maxDuration 300) →
  `runJobChunk`: chiếm việc nguyên tử (khớp `updated_at`), `runCreatorAI(..., "job", { timeBudgetMs: 200s, resume })`. Hết ngân sách →
  dừng TRƯỚC lượt model kế tiếp, trả `checkpoint` (contents rút gọn: kết quả tool >20k ký tự cắt, file nhị phân bỏ; kèm trạng thái
  "nhiễm" + skill) → lưu, xếp hàng lại, tự gọi chặng sau. Tối đa 6 chặng (~20 phút).
- Xong: lưu thành hội thoại "[GP] ⏳ …", DM Lark người giao (creator: `getCreatorLarkOpenId`; người khác: `users.lark_open_id`).
  Chuông thông báo KHÔNG dùng (bảng `notifications` là thông báo chung, không theo người).
- Cron `scheduled-messages` (cron-job.org, mỗi giờ) gọi `sweepStuckJobs`: chạy lại việc "queued" >2' hoặc "running" >6' (mất lượt gọi).
- Hành động cần duyệt trong việc nền → hàng chờ (kênh `job`), kết quả cuối liệt kê mã; duyệt ở panel hoặc Lark DM.
- Thử thật (máy dev): ngân sách 1ms → dừng sau vòng `readKnowledgeBase`, checkpoint qua JSON (như lưu jsonb) → chặng 2 trả lời đúng
  (thoughtSignature giữ nguyên).

**Panel "⏳ Việc & duyệt"** (mọi user Gấu Pro, `components/gau-pro/tasks-panel.tsx`): hành động chờ duyệt ≤24h (`GET /api/creator-ai/approve`,
duyệt/từ chối được kể cả sau khi tải lại trang — chỉ hiện kết quả, không tự gửi câu nối vào hội thoại đang mở) + danh sách việc nền
(trạng thái, số chặng, Mở kết quả, Huỷ; tự làm mới 15s khi có việc đang chạy).

**Chưa QA sống**: cần chạy v64 + v65 rồi thử trên staging: (1) giao 1 việc nền dài, (2) gửi Lark tới group → duyệt từ panel, (3) xem trace.

## § s223 fix (2026-10-05) — `thinkingLevel: "minimal"` làm hỏng âm thầm 3 tính năng

Gọi API thật: `gemini-3.8-flash` trả 400 "Thinking level MINIMAL is not supported for this model" (cả SDK cũ lẫn mới). 3 chỗ dùng
"minimal" đều nuốt lỗi trong catch nên KHÔNG ai thấy: `compress.ts` (nén lịch sử Gấu Pro khi hội thoại dài → luôn gửi nguyên lịch sử),
`learning.ts` (Bé Gấu tự học từ người dùng → không phân loại được gì), `task-assistant.ts` (tạo task khi có người @Hiếu giao việc trong
group → không tạo). Đổi sang "low"; thử thật: nén 24 tin → `summarized=true`. Bài học: đổi model thì thử lại mọi mức `thinkingLevel`
đang dùng; lỗi gọi model trong catch nên `console.error` thay vì nuốt im.

## § s223 G3 (2026-10-05) — Trí nhớ 2 tầng + panel "🧠 Trí nhớ"

Migration **v66** (`gp_conversation_memory` + RPC `match_gp_conversations`) — Hiếu phải chạy; chưa chạy thì tóm tắt bỏ qua, tool báo cách sửa.
- **Cờ bật** `app_settings.gp_personal_features`: `all` = mọi user Gấu Pro; khác/không có = chỉ creator (mặc định — đúng chốt "khung
  đa người dùng, hiện chỉ creator"). `personalFeaturesEnabled()` (cache 60s) quyết định: khối trí nhớ trong prompt, tool `assistantMemory`
  + `searchPastConversations` (tách khỏi `CREATOR_ONLY_TOOLS` sang `PERSONAL_TOOLS`), tự rút trí nhớ, tóm tắt hội thoại, panel.
- **Tự rút trí nhớ** (`lib/assistant-memory-auto.ts` `extractMemoriesFromTurn`): sau mỗi lượt web (trong `waitUntil`) và Lark DM, 1 lượt
  Gemini JSON đọc CHỈ tin nhắn người dùng (câu trả lời bot chỉ làm ngữ cảnh — tránh đầu độc trí nhớ bằng nội dung web/tài liệu), so với
  trí nhớ hiện có → tối đa 2 mục save/update, nguồn `auto-web`/`auto-lark_dm`. Bỏ qua câu <25 ký tự, câu nối sau duyệt, lượt model đã tự
  gọi `assistantMemory`. Thử thật: "anh Tuấn thay chị Lan + muốn cột CM1%" → 2 mục; câu hỏi doanh thu → 0; "Minh chuyển sang B2B Customer
  Report" → update đúng mục cũ.
- **Trí nhớ hội thoại**: `summarizeConversation` (sau mỗi lượt web, chỉ làm lại khi thêm ≥4 tin) tóm tắt ≤120 từ + embedding 3072 →
  upsert. Tool lõi `searchPastConversations(query)` → RPC (lọc username, ngưỡng 0,45) → tóm tắt + ngày + link `/analytics/creator/ai?c=<id>`
  (trang tự mở hội thoại theo `?c=`). Hội thoại Lark DM chưa được tóm tắt (lưu ở bảng khác).
- **Panel 🧠 Trí nhớ** (`components/gau-pro/memory-panel.tsx`, `GET/POST /api/creator-ai/memory`): xem, thêm tay, bấm để sửa, ghim, quên;
  đánh dấu "Gấu tự nhớ".

## § s223 G4 (2026-10-05) — Việc theo lịch + canh chừng (đặt bằng chat)

Migration **v67** (`gp_scheduled_tasks`) — Hiếu phải chạy (cần cả v65 vì chạy qua `gp_jobs`).
- Tool `scheduleTask` (create/list/cancel, thuộc `PERSONAL_TOOLS` → theo cờ `gp_personal_features`, hiện chỉ creator; audit log; tạo khi
  lượt đã "nhiễm" thì cần duyệt). Lịch giờ VN: `daily | weekly (1=T2…7=CN) | monthly (ngày 31 → cuối tháng) | once`; tối đa 10 việc
  đang bật/người. Prompt lưu phải TỰ ĐỦ (chạy độc lập, không thấy hội thoại — bài học ChatGPT Scheduled Tasks).
- `only_if_notable` = **canh chừng** (thay cho trigger viết cứng bằng code): prompt chạy kèm hướng dẫn "không có gì → trả đúng NO_ALERT";
  `runJobChunk` gặp NO_ALERT thì ghi nhận, không lưu hội thoại, không nhắn. Ngưỡng do người dùng nói bằng lời (vd "giảm >20% so TB 7 ngày").
  Doanh thu hằng ngày đã có digest 09:45 lo — không thêm trigger cứng trùng việc.
- Chạy: cron `scheduled-messages` (cron-job.org, hiện MỖI GIỜ, đang trỏ staging) → `runDueSchedules`: lấy ≤5 việc đến hạn, chiếm
  nguyên tử (dời `next_run_at` theo `nextRunAt`, khớp giá trị cũ), tạo việc nền `gp_jobs` → chặng chạy → DM Lark. Nên giờ chạy trễ tối đa
  ~1 giờ; muốn sát giờ thì tăng tần suất job ở cron-job.org.
- Panel "Việc & duyệt": mục "Việc theo lịch" (⏰ thường / 👀 canh chừng, lần tới, số lần đã chạy, Huỷ) — `GET/DELETE /api/creator-ai/schedules`.
- Test `gp-schedules.test.ts` (lịch theo giờ VN qua ranh giới ngày UTC, tuần, cuối tháng, once). Thử thật (giả lập lưu DB): "thứ 2 8h tóm tắt
  doanh thu tuần B2B/B2C" → weekly [1] 08:00 + prompt đầy đủ; "báo nếu doanh thu hôm qua giảm >20% so TB 7 ngày, 9h mỗi ngày" → daily 09:00
  + `only_if_notable: true`.

## § s223 QA (2026-10-05) — 2 lỗi gốc có sẵn tìm ra khi QA sống

1. **Tin nhắn hội thoại chatbot KHÔNG được lưu từ migration v34**: v34 (Tổ Gấu) `DROP TABLE chat_messages` rồi tạo lại CÙNG TÊN cho chat
   nhóm (`group_id/sender_email…`, không có `conversation_id/role`). Từ đó Bé Gấu web (`POST /api/chat/conversations/[id]`) và Gấu Pro ghi
   tin đều lỗi (supabase trả `{error}`, không throw → bị bỏ qua); `conversations` có ~506 dòng không tin nào; mở lại hội thoại cũ chỉ còn
   nhờ localStorage. Verify sống: `chat_messages` chỉ có cột chat nhóm, GET hội thoại trả "column chat_messages.role does not exist".
   Sửa: migration **v68** `conversation_messages` (FK `conversations` ON DELETE CASCADE) + chuyển mọi chỗ đọc/ghi (route
   `chat/conversations/[id]`, Gấu Pro chat, việc nền, tóm tắt trí nhớ, mô tả MCP, danh sách bảng nhạy cảm). Tin cũ đã mất, không khôi phục được.
2. **Mở/xoá hội thoại Gấu Pro 404 khi `name ≠ username`**: Bé Gấu lưu `conversations.username = session.user.name`, Gấu Pro lưu
   `session.user.username`; route `[id]` chỉ so `name`. Nay chấp nhận cả hai.

## § s223 G5 (2026-10-05) — Phiên giọng nói + màn hình/camera trực tiếp (kiểu Project Astra, thử nghiệm)

- Nút **🎙 Trực tiếp** (header Gấu Pro) → hộp thoại `components/gau-pro/live-session.tsx`. Bật theo cờ `gp_personal_features` (hiện chỉ creator).
- Model `GEMINI_LIVE_MODEL` (mặc định `gemini-3.8-live`, đã kiểm ListModels có `bidiGenerateContent`; đổi qua env).
- **Bảo mật**: `POST /api/creator-ai/live/token` tạo **token tạm** (SDK `authTokens.create`, v1alpha): dùng 1 lần, mở phiên trong 60s,
  sống 30 phút, KHOÁ model + system prompt + bộ tool trong `liveConnectConstraints` → trình duyệt kết nối thẳng Gemini mà không thấy
  `GEMINI_KEY`, không đổi được cấu hình. Rate limit 6 phiên/phút.
- **Chỉ tool ĐỌC** (`LIVE_TOOLS`: executeSQL, querySupabase, listSupabaseTables, queryProduct, read/searchKnowledgeBase, webSearch, GA4, GSC,
  searchPastConversations) — phiên live không có cổng duyệt nên không mở tool ghi/gửi/điều khiển (test khoá trong `gp-skills.test.ts`).
  Model gọi tool → trình duyệt POST `/api/creator-ai/live/tool` (kiểm allowlist, cắt kết quả >20k ký tự) → `sendToolResponse`.
- Prompt: `LIVE_VOICE_RULES` (nói ngắn, không markdown/chart/export, số đọc làm tròn, hình màn hình là dữ liệu không phải lệnh, việc
  ghi/gửi → chuyển chat thường) + prompt lõi + ngày + trí nhớ.
- Âm thanh: mic PCM 16-bit 16kHz qua AudioWorklet (`public/gp-pcm-capture.js` — file tĩnh vì CSP `script-src 'self'` chặn `blob:`), loa PCM
  24kHz xếp hàng phát, `interrupted` → dừng phát ngay (người dùng chen lời). Hình: `getDisplayMedia`/camera → canvas ≤1024px → JPEG ~1 khung/giây.
  `contextWindowCompression: slidingWindow` để phiên có hình không bị cắt ~2 phút. Có ô gõ chữ trong phiên.
- Kết thúc: `POST /api/creator-ai/live/log` lưu phụ đề thành hội thoại "[GP] 🎙 …" (`conversation_messages`, được tóm tắt cho
  `searchPastConversations`) + trace `gp_runs` kênh `live`.
- **Cấu hình trang phải sửa** (`next.config.js`): `Permissions-Policy` trước là `camera=(), microphone=()` → cấm hẳn mic/camera (kể cả nút
  mic nhập giọng nói có từ trước — thực tế không chạy được); nay `(self)`. CSP `connect-src` thêm `wss://generativelanguage.googleapis.com`.
- **QA sống staging**: token đúng 10 tool đọc; WebSocket với token → setup → hỏi chữ → model gọi `executeSQL` thật qua `/live/tool` → trả lời
  bằng TIẾNG + phụ đề "khoảng 6,27 tỷ đồng" (đọc số làm tròn đúng quy tắc); `/live/log` lưu hội thoại 2 tin + trace `live:executeSQL`; hộp
  thoại mở đúng, bấm Bắt đầu thì trình duyệt xin quyền micro (chính sách trang đã cho phép). **Chưa QA được bằng máy**: nói/nghe thật qua
  micro-loa, chia sẻ màn hình/camera (cần người cấp quyền trình duyệt) → Hiếu tự thử.

## § s223 trí nhớ (2026-10-05) — Gấu Pro "hay quên": 4 nguyên nhân thật + sửa

Đo trên dữ liệu thật (staging, dùng chung Supabase):
1. KB 79 mục ≈219.000 ký tự nhưng mỗi hội thoại chỉ nạp **8.000 ký tự đầu (≈3,6%)**, chỉ ở **lượt đầu**, xếp theo category (sku_rules…) →
   mục `vendors`/`notes` mới lưu gần như không bao giờ được thấy.
2. Embedding KB dùng `text-embedding-004` đã bị Google **gỡ (404)** → **0/79 mục có embedding**, `searchKnowledgeBase` luôn lỗi, lưu mục mới
   không báo gì.
3. Prompt bắt "đề xuất → CHỜ xác nhận" kể cả khi người dùng đã nói rõ "lưu lại" → lượt sau không gõ "ok" là không bao giờ lưu.
4. Trí nhớ cá nhân 13 mục ≈3.400/4.000 ký tự trần → sắp bị cắt mục cũ không báo.

Sửa (`lib/agents/creator/kb-recall.ts`, commit `71911e9f`):
- MỖI lượt nạp **danh mục tiêu đề toàn KB** (cache 5') + **nguyên văn các mục liên quan** tới câu hỏi (tìm theo ý nghĩa, top 6, ≥0,55 và
  không kém mục tốt nhất quá 0,15, tối đa 12k ký tự; câu ngắn kiểu "cái đó" ghép đoạn cuối câu trả lời trước để tìm).
- Embedding `gemini-embedding-001` cắt **768 chiều** (khớp cột `vector(768)` + index HNSW của v33 — không cần migration). Ghi KB / duyệt học
  liệu đều có embedding; `POST /api/creator-ai/knowledge/reembed` (creator) tạo lại cho mục thiếu — đã chạy: 79/79.
- `readKnowledgeBase(keys=[...])` đọc đúng mục; prompt cấm đọc toàn KB không tham số.
- Prompt: người dùng bảo lưu → LƯU NGAY (nghiệp vụ → `writeKnowledgeBase`, trùng chủ đề dùng lại key; cá nhân → `assistantMemory`), báo đã
  lưu gì vào đâu; chỉ HỎI trước khi chính Gấu tự gợi ý lưu.
- Trần trí nhớ cá nhân 4.000 → 8.000 ký tự.
- QA sống: cuộc mới hỏi "3HK có cho nạp thêm data vào gói Fixed?" → đúng nội dung mục KB 02/10, KHÔNG gọi tool; "tuần sau mình phụ trách gì?"
  → "sourcing eSIM EU từ ~12/10", KHÔNG gọi tool.
- ~~Bé Gấu vẫn nạp KB kiểu cũ~~ → đã sửa s225 (xem §s225 cuối file).

## § s223 G5 cách 2 (2026-10-05) — Công tắc "Cho Gấu thao tác" trong phiên Trực tiếp

- Nút 🖱 trong hộp thoại Trực tiếp, mặc định TẮT; bật → banner vàng cảnh báo. `readMyBrowser` + `controlMyBrowser` (`LIVE_CONTROL_TOOLS`)
  luôn khai báo trong phiên (đổi công tắc không cần mở lại phiên) nhưng `/api/creator-ai/live/tool` chỉ chạy khi client gửi `control: true`;
  tắt → trả lỗi "CHƯA bật", model nhắc người dùng. Tool gửi/ghi khác KHÔNG bao giờ chạy trong phiên (test `gp-live-tool.test.ts`).
- Chạy qua extension Bridge trên Chrome của chính người dùng (multi-tenant theo username); `controlMyBrowser` có audit log như cũ. Thao tác
  theo selector trang (đọc `read_tab` trước), không bấm theo toạ độ trên hình chia sẻ.
- Prompt phiên: nói trước mỗi thao tác, làm từng bước + đọc lại kiểm tra, cấm điền mật khẩu/OTP/thanh toán, thao tác không hoàn tác được
  phải hỏi bằng lời và chỉ làm khi người dùng đồng ý rõ.
- Rủi ro chấp nhận (Hiếu chọn): trong lúc bật, trang độc có thể khiến Gấu thao tác sai trên tab đó — giới hạn trong trình duyệt của chính người dùng.

## § s223 QA thao tác thật + extension Bridge 1.2.x (2026-10-05)

- QA lần 1 (tab DuckDuckGo, công tắc bật): Gấu đúng trình tự list_tabs → read_tab → fill nhưng ĐOÁN selector `#search_form_input_homepage` (id cũ)
  → "Không tìm thấy selector". Gốc: `read_tab` chỉ trả innerText.
- **Extension 1.2.0**: `read_tab` trả thêm `elements[{sel, tag, label}]` ≤150 phần tử tương tác (ô nhập/chọn trước, nút, link sau), `sel` = CSS
  selector đã kiểm DUY NHẤT (id → name/aria-label/placeholder/data-testid/title → đường nth-of-type). Mô tả tool + prompt phiên bắt dùng
  nguyên `sel`. **1.2.1**: chế độ dồn dập — vừa có lệnh thì poll 1s/lần trong 60s (trước 15s/lần → mỗi bước chờ ~7–15s), rảnh về 15s;
  server chờ kết quả 2s → 1s; route Live cắt `content` read_tab còn 6.000 ký tự trước khi cắt JSON (lần 2 kết quả >20k bị cắt thành chuỗi,
  danh sách selector có nguy cơ mất).
- QA lần 2 (sau khi Hiếu tải lại 1.2.0): Gấu dùng đúng `textarea[name="q"]` → ô có "eSIM Nhật Bản", URL không đổi (không Enter), đọc lại tab
  rồi nói xác nhận; audit log ghi `controlMyBrowser` ok. Mỗi bước còn chậm (~20–40s) → lý do làm 1.2.1.
- ⚠️ Mọi người dùng Bridge phải tải lại extension (`chrome://extensions` → ↻) để có 1.2.x.

## § s223 Bridge — tải bản mới + tự báo cập nhật (extension 1.2.2)

- Extension cài kiểu "Load unpacked" → Chrome đọc file từ THƯ MỤC TRÊN MÁY từng người; bấm ↻ chỉ đọc lại thư mục đó. Người không có repo
  phải nhận file mới mới lên bản mới được.
- `web/scripts/pack_bridge_extension.py` (chạy MỖI LẦN sửa `browser-extension/` + tăng version): sinh `web/public/downloads/gau-pro-bridge.zip`
  (thư mục `gau-pro-bridge/`, không nén) + `web/src/lib/bridge-version.ts` (`BRIDGE_LATEST_VERSION`). Test `bridge-version.test.ts` đỏ nếu
  manifest ≠ hằng số ≠ zip (quên chạy script).
- Trang Bridge: nút "⬇️ Tải extension (bản x.y.z)" (`/downloads/…` không qua middleware đăng nhập — mã extension không có bí mật, token
  người dùng tự dán) + hướng dẫn cài vào thư mục CỐ ĐỊNH và cách cập nhật (giải nén ĐÈ → ↻).
- `bridge/next` trả `latest_version`; extension lưu lại; popup hiện phiên bản đang dùng + khung "⬆️ Có bản mới …" kèm link tải khi cũ hơn.
  Người dùng phải lên 1.2.2 THỦ CÔNG 1 lần (bản có tính năng báo) — từ đó về sau popup tự báo.

## § s223 Chốt plan "Gấu Pro → trợ lý agent" (2026-10-05, đã xoá `docs/plans/gau-pro-assistant.md`)

Đã làm G0–G5 + sửa trí nhớ + Bridge 1.2.2 (chi tiết các mục §s223 ở trên). Quyết định đã chốt: mức duyệt "gửi Lark người khác luôn hỏi,
tool ghi/gửi khác chỉ hỏi khi lượt đã đọc nội dung ngoài"; không lên Vercel Pro (việc nền chạy theo chặng tự gọi tiếp); trí nhớ + việc theo
lịch + phiên Trực tiếp là khung đa người dùng, bật theo `app_settings.gp_personal_features` (hiện chỉ creator); phiên Trực tiếp có công tắc
"Cho Gấu thao tác" (cách 2).
**Còn mở (ai làm tiếp đọc đây):**
- Bé Gấu (`be-gau.ts`) còn dùng SDK cũ `@google/generative-ai` (KB đã chuyển sang `kb-recall.ts` ở s225).
- "Nhiễm" (cổng duyệt) chỉ tính trong 1 lượt — nội dung ngoài đọc ở lượt trước không làm lượt sau phải duyệt.
- Lark DM chưa hiện kế hoạch (`plan`), chưa có phiên giọng nói; hội thoại Lark DM chưa được tóm tắt cho `searchPastConversations`.
- Việc theo lịch phụ thuộc cron-job.org gọi `scheduled-messages` mỗi giờ (đang trỏ STAGING) → giờ chạy trễ tới ~1h.
- Phiên Trực tiếp: chưa có người thật thử nói/nghe qua mic-loa + chia sẻ màn hình/camera trên production; mỗi bước thao tác Bridge 3–4s
  (lần đầu ≤15s chờ nhịp poll).
- Mọi người dùng Bridge phải cài 1.2.2 thủ công 1 lần (trang Bridge → Tải extension → giải nén đè → ↻).

## s225 (2026-10-06) — Bé Gấu tra KB mỗi lượt (dùng chung `kb-recall.ts`)
- Trước: Bé Gấu chỉ nạp `JSON.stringify(toàn KB).slice(0, 5000)` ở LƯỢT ĐẦU — cùng lỗi Gấu Pro đã sửa ở s223 (thấy ~2% KB, mục mới gần như không bao giờ thấy, lượt sau không có KB).
- Nay: MỖI lượt nạp `kbIndexBlock()` (danh mục tiêu đề) + `relevantKbBlock(câu hỏi)` (nguyên văn mục gần nhất theo embedding); câu ngắn <40 ký tự ghép 500 ký tự cuối câu trả lời trước — y hệt Gấu Pro.
- Phân quyền giá vốn: `kb-recall.ts` thêm `opts.excludeCategories`; role không priv truyền `["cogs"]` → mục cogs không có trong danh mục lẫn khối liên quan. Tool `readKnowledgeBase` vẫn lọc cogs sau khi đọc (kể cả khi model đưa key cogs).
- Tool `readKnowledgeBase` của Bé Gấu có thêm tham số `keys` (đọc đúng mục từ danh mục). Bản trùng `runReadKnowledgeBase` trong `creator-ai.ts` (không có `keys`, chỉ Bé Gấu dùng) đổi thành re-export từ `creator/tools/knowledge.ts`.
- Lọc cogs xảy ra SAU `match_count: 6` của RPC → với role không priv có thể còn ít mục hơn 6 nếu câu hỏi trúng mục cogs. Chấp nhận.
- Test: `be-gau-runner.test.ts` khoá staff truyền `excludeCategories: ["cogs"]` (cả lượt sau), admin truyền `{}`.


## § s228 (2026-10-08) — Sửa 3 lỗi mở sau G0–G5 (plan be-gau-upgrade §1)

- **Cổng duyệt nhớ qua nhiều lượt**: cuối mỗi lượt `gp_runs.steps` thêm bước `{ tainted, taintSources }`. Lượt sau của cùng cuộc chat
  (có lịch sử, cùng người + kênh, ≤2 giờ) đọc bước đó → nếu lượt trước đã đọc nội dung ngoài thì lượt này cũng "nhiễm" (nguồn ghi
  "… (lượt trước)"). Kênh cron không áp. Danh sách Lượt chạy hiện dòng "⚠ đã đọc nội dung ngoài".
  Hạn chế: không có `conversation_id` trong `gp_runs` → cuộc chat KHÁC trong 2 giờ có lịch sử cũng có thể bị coi nhiễm (thừa duyệt, an toàn).
- **Lark DM hiện kế hoạch**: lần đầu model gọi `updatePlan` → bot gửi 1 tin "📋 Kế hoạch: …" (không gửi các lần cập nhật để khỏi spam).
- **Tóm tắt hội thoại Lark DM**: `summarizeLarkThread()` tóm tắt luồng `lark_chat_history` (khi thêm ≥4 tin) vào `gp_conversation_memory`
  với id UUID suy từ `lark:{openId}:{threadId}`, tiêu đề "[Lark DM] …" → `searchPastConversations` tìm được (link ghi "trong Lark DM").

## § s228 U4 (2026-10-08) — Giao diện chat mới cho Gấu Pro

- Thanh trên: "Gấu Pro / <tên hội thoại ▾>" (`components/chat/conversation-switcher.tsx`, bỏ nút Lịch sử riêng) + ✎ cuộc mới + ⋯
  (`overflow-menu.tsx`): Trực tiếp, Trí nhớ, Việc & duyệt (số việc chờ duyệt — chấm đỏ trên ⋯, đọc `/api/creator-ai/approve`),
  Nhật ký & lượt chạy, Lark/Google (creator). Các panel cũ mở ngay dưới ⋯. Bỏ hàng nút rải rác + 2 nhãn "Đã kết nối".
- Hội thoại dài: `use-stick-to-bottom.ts` (bám đáy khi đang ở cuối, nút "↓ Tin mới nhất"), >40 tin thu gọn "Hiện N tin trước".

## § s228 U5a (2026-10-08) — Khoá Gấu Pro, chỉ còn Creator

- `lib/gp-access.ts`: cờ `GP_CREATOR_ONLY = true` → `loadGpAllowed()` trả rỗng, `hasGpAccess()` chỉ Creator. Mọi route đang gác bằng 2 hàm
  này (chat, approve, jobs, live, bridge/token) tự chặn người không phải Creator. Danh sách `gp_allowed_users` giữ nguyên (đọc bằng
  `loadGpListed()`) chỉ để biết ai từng dùng. Mở lại: đổi cờ về `false`.
- `/api/user/me` thêm `gp_moved` (từng được cấp, nay bị khoá) — `gp_enabled` chỉ còn Creator nên menu Gấu Pro/Bridge tự ẩn. Trang Gấu Pro và
  Bridge thấy `gp_moved` thì hiện `components/gau-pro/moved-to-be-gau.tsx` ("Gấu Pro đang cập nhật…" + nút Mở Bé Gấu) thay vì đẩy về /analytics.
- Chuyển dữ liệu: route chạy 1 lần `POST /api/admin/gau-pro-moved` (Bearer CRON_SECRET; mặc định `dryRun`; `{dryRun:false, migrate:true,
  notify:true}`). Hội thoại "[GP] …" đổi `username` → tên hiển thị (`users.name`, khoá hội thoại Bé Gấu), giữ tiền tố [GP]; DM Lark từng
  người có `lark_open_id`. Trí nhớ (`assistant_memory`, `gp_conversation_memory`) vốn lưu theo username, Bé Gấu đọc chung — không cần chuyển
  (lúc khoá: người không phải Creator không có dòng nào, cũng không có việc theo lịch/việc nền).
- Lark DM với Gấu Pro vốn chỉ Creator — không đổi. Bridge chưa có trong Bé Gấu: người bị khoá mất Bridge.

## § s228 U5b (2026-10-08) — Phiếu sửa code: Gấu Pro lập kế hoạch → Claude Code thực hiện

Luồng: Hiếu nhờ Gấu Pro sửa/thêm chức năng web → Gấu Pro (skill `dev-ticket`) trình bày kế hoạch + gọi `devTicket(action:"create")` →
cổng duyệt (`tool-policy.ts`: create LUÔN cần duyệt; answer/cancel cần duyệt khi lượt bị nhiễm) → duyệt trên web (thẻ Duyệt) hoặc Lark
("duyệt <mã>"; tạo từ web thì bot tự nhắn Lark kèm mã) → `lib/dev-tickets.ts` tạo dòng `dev_tickets` (v71) + gọi GitHub `workflow_dispatch`
`.github/workflows/claude-ticket.yml` (ref staging, input `ticket_id` + nội dung phiếu ≤60k ký tự).

Workflow: nhánh `auto/ticket-<id>` (chạy lại thì merge staging vào nhánh cũ) → `anthropics/claude-code-action@v1` với
`CLAUDE_CODE_OAUTH_TOKEN` (gói Claude Pro, `claude setup-token`), `--max-turns 80`, chỉ cho Read/Edit/Write/Glob/Grep + tsc/vitest/next lint/git
đọc, cấm WebFetch/WebSearch, 45 phút, 1 phiếu chạy 1 lúc → Claude ghi `.ticket/question.md` (dừng hỏi) hoặc `.ticket/summary.md` → workflow
commit, đẩy nhánh, `gh pr create --base staging` → báo `POST /api/dev-tickets/callback` (Bearer `DEV_TICKET_SECRET`, secret riêng chỉ dùng ở đây)
→ bot nhắn Lark Hiếu: câu hỏi / link PR + bản xem thử Vercel (`gohub-intel-git-auto-ticket-<id>-…vercel.app`) / lỗi.
Luật cho Claude nằm TRONG file workflow (web không đổi được): không push/merge, không sửa `.github/`, không gọi mạng, không chạy migration
(chỉ viết file SQL), chạy tsc/vitest/lint, cập nhật wiki. Job chỉ có env mock cho vitest — không bí mật production nào.

Trả lời câu hỏi: nhắn Gấu Pro "phiếu <số>: <trả lời>" (tool `answer`) hoặc ô trả lời ở Creator Settings → mục "Phiếu sửa code"
(`dev-tickets-section.tsx`, API `GET/POST /api/dev-tickets`, chỉ Creator) → phiếu chạy lại kèm hỏi đáp.
Trạng thái trống của mục: "Chưa có phiếu nào — nhờ Gấu Pro tạo phiếu sửa code."

Cần có: migration v71; Vercel env `GITHUB_DISPATCH_TOKEN` (token GitHub fine-grained, repo gohub, quyền Actions: Read and write) +
`DEV_TICKET_SECRET` (đã cài); GitHub secrets `CLAUDE_CODE_OAUTH_TOKEN` + `DEV_TICKET_SECRET` (đã cài); repo Settings → Actions → General →
"Allow GitHub Actions to create and approve pull requests"; workflow phải có trên `main` (nhánh mặc định) thì mới dispatch được.
Gotcha: PR do `GITHUB_TOKEN` tạo KHÔNG kích hoạt workflow CI khác (luật GitHub) — workflow phiếu đã tự chạy tsc/vitest qua Claude.

## s229 — sendLarkMessage nhắn DM người khác
Tool `sendLarkMessage` (chỉ Creator) thêm tham số `lark_id` = open_id Lark (`ou_...`, cột `users.lark_open_id`) → DM riêng thay vì chat_id.
`chat_id` giờ không bắt buộc (cần `chat_id` hoặc `lark_id`). Có `lark_id` thì LUÔN qua cổng duyệt (`ruleFor` "always"); thẻ duyệt hiện "DM ou_...".
Code: `declarations.ts`, `tools/lark-send.ts`, `tool-policy.ts`, skill `lark` trong `skills.ts`.

## s229 P1 — trí nhớ giữ lịch sử khi cập nhật (plan `docs/plans/personal-agent.md`)
Eval P0 (`web/eval/results/memory-*.md`): hỏi giá trị CŨ sau khi cập nhật → 0/5 vì `assistantMemory update` ghi đè `content`. Sửa:
- Migration **v72** `assistant_memory.history JSONB` (Hiếu phải chạy + Reload schema). `update` đổi nội dung → đẩy bản cũ vào `history`
  `[{c, at}]`, giữ tối đa 5 bản gần nhất; cùng nội dung thì không thêm.
- Khối nạp prompt thêm ` ⟲ trước đây: "…" (đến YYYY-MM-DD)` (2 bản gần nhất, mới trước); `action=list` trả đủ `history`.
- Prompt rút trí nhớ tự động + khối hướng dẫn: `content` chỉ ghi trạng thái HIỆN TẠI (hệ thống tự giữ giá trị cũ).
- Chưa chạy v72 → đọc lại không có cột history và update ghi đè như cũ (fail-safe, có test).
Cách kiểm: `node web/scripts/eval-memory.mjs --label p1 --stress 60` (cần v72 đã chạy), so nhóm `stress_history`/`history` với `memory-stress60.md`.

## s229 P1b — bộ rút trí nhớ lấy mục liên quan
`extractMemoriesFromTurn` trước chỉ đưa 120 mục đầu cho model → vượt 120 mục thì không `update` được mục cũ (eval stress 150: 629 mục cho 150 khách, `history` dùng 4 lần).
Nay `findRelevantMemories` (`lib/assistant-memory.ts`) đọc mọi mục còn hiệu lực của user (1 truy vấn, ≤3000) và `rankMemories` xếp theo từ khoá hiếm (IDF, bỏ dấu tiếng Việt)
→ top 40 liên quan + 10 mục mới nhất. Không gọi thêm model. Kết quả stress 150: 320 mục, `history` dùng 236 mục. Giới hạn: khớp từ khoá, chưa khớp theo ý nghĩa (paraphrase) — thêm vector nếu eval cho thấy cần.
