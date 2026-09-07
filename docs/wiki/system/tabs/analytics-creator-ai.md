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
| `browseWeb` (s195) | Headless browser (CDP, container tự host) | Mở 1 URL thật, chạy JS đầy đủ, đọc nội dung — cho trang SPA/JS-nặng mà webSearch không đọc được. KHÔNG dùng cho portal có login (đó là `browsePortal`) |
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

### Bé Gấu (chatbot team) — s131

Từ s131, Bé Gấu chuyển sang `be-gau.ts` (single function-calling agent, không còn pipeline 6-agent):
- 1 vòng lặp ≤12 iterations, Gemini tự chọn tool
- Tools: executeSQL (gohub_dw), querySupabase, queryProduct, webSearch, readKnowledgeBase, queryGA4, queryGSC
- Guardian pre-flight vẫn giữ ở route level
- Legacy pipeline (router/graph/orchestrator/agents) giữ file nhưng không còn là luồng chính
