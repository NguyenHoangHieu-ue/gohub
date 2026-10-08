---
title: "GoHub AI Chatbot (Bé Gấu Thông Thái)"
page_type: tab_guide
is_hidden: true
department: all
tags: [tab, chatbot, ai]
created: 2026-06-28
updated: 2026-09-07
status: active
---

# GoHub AI Chatbot (Bé Gấu Thông Thái)

Mô tả chi tiết kỹ thuật, cơ chế định tuyến, bảo mật và phân vùng dữ liệu của hệ thống Chatbot đa tác nhân (7 Agents) tích hợp trên Giao diện Web và Lark Bot.

> **Mục đích & vai trò**: "Bé Gấu" là trợ lý AI trung tâm — nhân viên hỏi tự nhiên (tiếng Việt) về gói cước/giá/SKU/catalog NCC/số liệu kinh doanh thay vì phải tự tra DB hay mở nhiều tab. **Tại sao chia 6 agent chuyên biệt**: nếu nhồi tất cả vào 1 prompt, LLM dễ quá tải ngữ cảnh + trả sai; tách theo vùng dữ liệu giúp mỗi agent "giỏi 1 việc" và bảo mật theo quyền. **Tại sao có Guardian + lọc COGS**: tránh rò thông tin nhạy cảm (giá vốn, nội bộ hệ thống) cho người không có quyền. Đổi tên hiển thị "GoHub AI"→**"Bé Gấu"** (s82).

---

## s227g (2026-10-07) — U1b: lõi agent chung Bé Gấu + Gấu Pro
- `lib/agents/core/agent-loop.ts` → `runAgentLoop({ model, contents, configFor(round), runTool(call, round), maxRounds, onChunk, signal,
  timeBudgetMs, startedAt, onRound })`: gọi model → chạy mọi tool của lượt song song → lặp; dừng khi hết tool / bấm Dừng (`stopped`) /
  hết ngân sách thời gian việc nền (`unfinished`). Trả `last`, `toolsUsed`, token cộng dồn, `rounds`/`tools` (số đo) và `next(config?, onChunk?)`
  để persona gọi thêm 1 lượt (ép gọi tool, viết lại câu trả lời rỗng).
- **Bé Gấu** (`be-gau.ts`): `configFor = lượt 0 ? config (HIGH nếu câu phân tích) : lowConfig`, tối đa 12 lượt; `runTool` = switch tool cũ.
  Lượt ép `larkWorkspace` dùng `loop.next(cfg ANY, () => {})` (không stream). `trace.rounds/tools` lấy từ `loop`.
- **Gấu Pro** (`creator-ai.ts`): `configFor = () => makeConfig()` dựng lại mỗi lượt → kỹ năng vừa `loadSkill` có tool ngay lượt sau (bỏ cờ
  `skillsChanged`). `runTool` giữ nguyên updatePlan/loadSkill/cổng duyệt/dispatchTool/steps; `onRound` ghi steps cho `gp_runs`.
- Sửa vòng lặp/streaming/đo đạc thì sửa 1 chỗ ở `core/`, cả hai cùng có. Persona chỉ giữ prompt, tool theo vai trò, cách chạy 1 tool.

## s227d (2026-10-07) — Bé Gấu tạo Doc/Sheet/task trong Lark cho người hỏi ("mức A") + sửa định dạng tin Lark
- **Tool `larkWorkspace`** (mọi vai trò, `lib/agents/lark-workspace.ts`): `create_doc` (markdown → Lark Docs), `create_sheet` (mảng 2 chiều →
  Lark Sheets), `create_task` (Lark Task giao cho người hỏi). Dùng **token của bot** — người dùng không cần kết nối thêm, chỉ cần
  `users.lark_open_id` (lưu khi đăng nhập bằng Lark; web tra theo username rồi email, Lark lấy open_id người nhắn). Doc/Sheet xong thì
  **chuyển quyền sở hữu** cho người hỏi (file nằm trong Lark của họ), lỗi thì cấp `full_access`. Bot KHÔNG đọc/sửa file riêng của họ.
- Thứ tự (Hiếu chốt): **DM báo trước** → làm → **DM kèm link**; câu trả lời cũng phải có link. Lỗi → DM báo lỗi. Tài khoản chưa có
  `lark_open_id` → báo "đăng nhập bằng Lark một lần". Hàm dựng Doc/Sheet dùng chung với Gấu Pro: `runLarkDocsWithToken` (`lark-docs.ts`).
- **Định dạng tin Lark** (`lib/lark.ts` `larkMessageBodies`): tin "text" của Lark không hiểu markdown (`**Điểm lưu ý**` hiện nguyên).
  Nay `sendLarkMessage` / `replyLarkMessage` / `sendLarkDM`: có markdown → **interactive card** (markdown + bảng thật, link bấm được);
  không có → text; card bị từ chối hoặc >20.000 ký tự → text đã bỏ dấu. Áp cho MỌI tin bot (Bé Gấu, Gấu Pro, cron DM). Route Lark bỏ
  `stripMarkdown` trước khi trả lời. Test `__tests__/lark-message-format.test.ts`.

## 1. Tổng quan & Đường dẫn
- **Giao diện Web**: `/chatbot` (`web/src/app/(dashboard)/chatbot/page.tsx`)
- **API Backend**: `/api/chat` (`web/src/app/api/chat/route.ts`)
- **Lark Bot Integration**: `/api/lark/events` (`web/src/app/api/lark/events/route.ts`)
- **Tập tin cấu hình cốt lõi**:
  - `web/src/lib/agents/agents.ts` — Định nghĩa System Prompts, DISPLAY_RULES và BI Schema.
  - `web/src/lib/agents/router.ts` — Logic định tuyến tác vụ (Tĩnh + Động).
  - `web/src/lib/agents/classifier.ts` — Phân loại Ý định (Intent) và Nguồn dữ liệu (Data Source).
  - `web/src/lib/agents/tools.ts` — Các công cụ truy vấn Supabase & thuật toán khớp địa danh.
  - `web/src/lib/agents/context.ts` — Hàm xây dựng ngữ cảnh động (Context Builder).
  - `web/src/lib/agents/cache.ts` — Quản lý bộ nhớ đệm (TTL 30 phút).
  - `web/src/lib/agents/bi-analyst.ts` — Hệ thống BI Analyst dùng chung (chạy SQL thực tế).

---

## 2. Kiến trúc 7 Tác Nhân (Agents) & Phân Vùng Dữ Liệu
Để tránh LLM bị quá tải ngữ cảnh và tăng tính chính xác, hệ thống phân chia thành 7 Agent chuyên biệt sở hữu các vùng dữ liệu độc quyền:

| Tên Agent | ID Agent | Vùng Dữ Liệu Sở Hữu | Nhiệm Vụ / Phạm Vi Hoạt Động |
|---|---|---|---|
| **Tư Vấn** | `tu-van` | Bảng `sku_catalog` (Supabase) | Tìm kiếm gói cước GoHub theo quốc gia, số ngày, dung lượng, loại SIM (SIM/eSIM). |
| **Tra Cứu** | `tra-cuu` | Bảng `products`, `skus`, `listings`, `items` | Tra cứu chi tiết thông số, giá vốn (COGS) và tỷ giá dựa trên mã code chuẩn. |
| **Giải Đáp** | `giai-dap` | Bảng `kb_documents`, `kb_wiki_pages` | Giải thích thuật ngữ viết tắt, cấu trúc mã SKU, quy trình, tài liệu Wiki nội bộ. |
| **NCC & Gap** | `gap-analysis` | Bảng `ncc_worldmove`, `ncc_datapool` (3HK) | Duyệt catalog của nhà cung cấp và phát hiện khoảng trống sản phẩm (`exist=No`). |
| **BI Analyst** | `bi-analyst` | Kho dữ liệu PostgreSQL `gohub_dw` | Tự động sinh mã SQL, thực thi truy vấn và trả về kết quả số liệu kèm biểu đồ. |
| **Kho Dữ Liệu** | `data-explorer` | **CẢ HAI**: `gohub_dw` (SQL) + Supabase (REST 38 bảng catalog/config) | Truy xuất DỮ LIỆU THÔ toàn hệ thống — đếm/liệt kê/tra bảng nhanh (SKU active, số nước, thống kê catalog, usage theo nước…). |

> **Agent `data-explorer` (🗄️ Kho Dữ Liệu, thêm s95)** — dùng cho câu hỏi cần đọc NHIỀU bảng / đếm-liệt kê nhanh mà không phải mở đúng tab.
> - **Tool**: `executeSQL` (gohub_dw, chỉ SELECT/WITH) · `querySupabase` (select có cấu trúc: `table/columns/filters[eq,neq,gt,gte,lt,lte,like,ilike,in,is]/order/limit≤200/countOnly`) · `listSupabaseTables`. File: `web/src/lib/agents/data-explorer.ts` (`runDataExplorer`, Gemini function-calling temp0, ≤10 vòng). **Đếm theo nhóm**: querySupabase KHÔNG có GROUP BY → agent lấy giá trị nhóm rồi `countOnly` từng nhóm (hoặc dùng executeSQL nếu bảng ở gohub_dw).
> - **Phân biệt với `bi-analyst`**: bi-analyst = CHỈ SỐ kinh doanh có kỳ (doanh thu/lợi nhuận/target/hiệu suất); data-explorer = ĐẾM/LIỆT KÊ/THỐNG KÊ dữ liệu catalog/hệ thống. Classifier có intent `data_explore`; router có override `DATA_EXPLORE_RE` (conservative: "có bao nhiêu SKU/nước…", "tra dữ liệu", "kho dữ liệu").
> - **Bảo mật (guardian nhiều tầng)**: `guardCheck` message-level chạy TRƯỚC (như mọi agent). Tầng agent: 10 bảng nhạy cảm (`users`, hội thoại, ticket, `app_settings`…) **chỉ admin·creator**; role≠admin bị chèn `role_filters` vào SQL gohub_dw; lược cột COGS nếu không có quyền xem giá vốn; luôn lược cột `embedding`. Dispatch ở `/api/chat` + `/api/lark/events` (non-stream, giống bi-analyst).

---

## 3. Luồng Xử Lý (Workflow) & Định Tuyến (Routing)
Hệ thống sử dụng luồng xử lý hybrid kết hợp Deterministic Rules và AI Classifier:

1. **Phân loại Ý định (Classifier)**:
   - Sử dụng mô hình `gemini-3.5-flash` để phân tích thông điệp người dùng, trả về JSON gồm: `intent` (9 loại), `data_source` (`gohub_system`, `ncc_catalog`, `both`), `country`, `sim_type`, `needs_clarification`.
2. **Kiểm soát Bảo mật & Quyền hạn (Guardian)**:
   - Chặn các câu hỏi cố tình khai thác mã nguồn, prompts, rò rỉ dữ liệu nhạy cảm hoặc tấn công Jailbreak.
   - Trả lời mặc định `"Hãy hỏi Hiếu/Anh Bảo 😊"` đối với các truy vấn xâm phạm hệ thống.
   - Lọc COGS rò rỉ khi người dùng không có quyền xem chi phí.
3. **Định Tuyến Động (Router)**:
   - Khắc phục lỗi đồng âm tiếng Việt (ví dụ từ "nhất" trong "bán chạy nhất" bị nhận nhầm thành nước "Nhật"). Áp dụng hàm `stripSuperlativeNhat()` để chuẩn hóa.
   - Áp dụng bộ lọc từ ranh giới (`wordMatch()`) để loại bỏ nhận diện quốc gia nhầm lẫn (ví dụ "đi UK 5 ngày" không bị nhận nhầm thành "Nga").
4. **Hỏi Lại Tự Động (Clarification)**:
   - Nếu câu hỏi quá mơ hồ, hệ thống ngắt tiến trình AI (short-circuit), trả về yêu cầu làm rõ ngay lập tức trên Web (badge Làm Rõ) hoặc Lark Bot mà không tiêu tốn token LLM.
5. **Xây dựng Ngữ cảnh & Gọi LLM**:
   - Truy vấn công cụ tương ứng (ví dụ: `searchSkus()`, `searchNccWm()`).
   - Khớp danh mục NCC bằng thuật toán chấm điểm `nccCountryScore()` (3 = nước trực tiếp, 2 = khu vực, 1 = toàn cầu).
   - Truyền ngữ cảnh sạch vào LLM để tạo ra câu trả lời trực quan, cấu trúc bảng đẹp mắt.

---

## 4. Công Thức & Quy Tắc Khớp Địa Danh
- **Khớp quốc gia (4-step country fallback)**:
  1. Dò tìm trực tiếp gói đơn nước (Single-country group).
  2. Tra cứu nhóm nước hỗ trợ (ISO Code mapping).
  3. Tìm kiếm mờ trong danh mục `ref_support_countries` thông qua `ILIKE`.
  4. Trả về gói đa quốc gia / khu vực tương ứng (Europe, Asia, Worldwide).
- **Bộ lọc dung lượng đặc biệt**:
  - Tự động nhận diện các gói "Không giới hạn" (unlimited) khi thuộc tính `data_amount >= 9999` hoặc cờ `is_unlimited = true`.

---

## 4a. Đính kèm ảnh/file (s192, 2026-09-05)

`/api/chat` nay nhận thêm `multipart/form-data` (song song JSON cũ, tin nhắn thường không đổi hành vi) —
FE `chatbot/page.tsx` có nút paperclip + kéo-thả + paste ảnh (Ctrl+V), tối đa **5 file/lượt, 20MB/file**.
Dùng chung `parseUploadedFile()`/`FileContext` (`web/src/lib/agents/file-parser.ts`, tách ra từ Gấu Pro để
2 agent không chép lại logic) — hỗ trợ PDF/ảnh (gửi thẳng Gemini multimodal qua `inlineData`), Excel→CSV,
PPTX→text, DOCX→text, CSV/JSON/TXT/code→text thẳng. `runBeGau()` nhận thêm `fileContexts?: FileContext[]`,
build parts y hệt cách `runCreatorAI` (Gấu Pro) làm. ## 4a-2. Xuất file (s192+1, 2026-09-05)

Bé Gấu nay xuất được **Excel (full từ SQL, không giới hạn 200 dòng)**, **Word**, **PDF**, **CSV** — y hệt
Gấu Pro, qua nút hiện dưới câu trả lời khi model tự sinh khối \`\`\`export (chỉ khi user xin xuất/tải, hoặc
tự động khi bảng >15 dòng). Route riêng `POST /api/chat/export` (mở cho **mọi role đã đăng nhập**, rate-limit
20/phút — khác `/api/creator-ai/export` chỉ admin/creator) dùng chung hàm sinh file
`web/src/lib/export-docs.ts` (`buildXlsxFromSql`/`buildDocxFromMarkdown`) và component nút bấm
`web/src/components/chat-export.tsx` (`ExportBar`, dùng chung cả 2 agent). PDF vẫn sinh client-side
(html2canvas+jsPDF), không qua route. Nút xuất tự ẩn khi CHÍNH message đó đang stream dở (tránh flicker vì
marker `\`\`\`export` có thể chưa đóng xong).

## 4a-3. Gộp tool Gấu Pro vào Bé Gấu (s190, 2026-09-05 — retroactive doc, code đã làm từ s190 nhưng chưa ghi wiki tới lúc audit s192)

`be-gau.ts` import trực tiếp `creator/declarations.ts` + `creator/tools/dispatch.ts` (dùng CHUNG executor
với Gấu Pro, không chép lại logic) và chia 2 nhóm:

- **`GP_TOOLS_OPEN`** (mọi role đã đăng nhập, đúng tinh thần "ai cũng như nhau"): `generateImage`
  (Pollinations, miễn phí), `getTrendSnapshots`, `queryLarkBase`, `compareVendorQuotes`,
  `trackSKUWinRate`, `searchKnowledgeBase` (đọc chung `creator_kb` với `readKnowledgeBase` sẵn có — che
  category `cogs` cho role không có quyền xem giá vốn, khớp cách `readKnowledgeBase` xử lý).
- **`GP_TOOLS_ADMIN_ONLY`** (chỉ `admin`/`creator` — `isAdminCreator`, KHÔNG gồm manager/bod): `writeKnowledgeBase`/
  `reviewPendingLearning`/`approveLearning`/`rejectLearning` (ghi đè KB dùng chung cho mọi người hỏi Bé Gấu
  sau này — 1 người ghi sai/ghi bậy lan ra toàn bộ câu trả lời sau đó), `browsePortal`/
  `managePortalCredentials` (đăng nhập + đọc credential portal NCC bên thứ 3), `sendLarkMessage` (gửi tin
  Lark tới bất kỳ group nào — rủi ro spam/mạo danh), `listLarkTasks`/`listLarkTasklists`/`getLarkTask`/
  `createLarkTask`/`updateLarkTask` (luôn thao tác trên tài khoản Lark CÁ NHÂN của Hiếu qua OAuth riêng —
  mở cho role khác sẽ lộ task cá nhân, không phải lỗi phân quyền thường mà là rò rỉ dữ liệu cá nhân),
  `generateImageStability`/`generateVideo`/`checkVideoStatus` (API trả phí Stability AI/Kling — tránh lạm
  dụng tốn tiền khi mở toàn công ty).
- Cơ chế chặn: Gemini chỉ thấy `functionDeclarations` được đăng ký trong request — role không phải
  admin/creator thì mảng `GP_TOOLS_ADMIN_ONLY` không được thêm vào, nên Gemini vật lý không gọi được (độc
  lập với Guardian, vốn chỉ chặn ở tầng CÂU HỎI category `system_internal`).

## 4b. Lưu hội thoại & Ghi chú kỹ thuật
- **Lịch sử chat** lưu Supabase: `conversations` + `chat_messages` (API `/api/chat/conversations` + `/[id]`).
- **Đọc listings** trong tool: qua `pickListing()` (core cột + field `_vn`/network_operator từ JSONB `metadata`) — xem [[skus]].
- **searchSkus fix (s87)**: đã sửa bug lớn ở tra cứu SKU của agent (đảm bảo khớp đúng gói).
- **FX/COGS**: giá vốn quy đổi qua `app_settings` key `fx.*` (usd_vnd, hkd_usd, twd_usd); COGS 3HK tính từ `ncc_datapool` giá HKD/GB.
- **Dùng chung Web + Lark**: router/context/bi-analyst dùng chung; Lark bot "Bé Gấu Thông Thái" (p2p + group + thread mention).
- **Tap phụ cho My Metrics (s173)**: ngay sau khi parse xong nội dung tin nhắn trong `api/lark/events/route.ts`
  (TRƯỚC filter "group phải @mention BOT mới trả lời" — 2 mối quan tâm khác nhau), có 1 lời gọi fire-and-forget
  `captureForOkrLog()` (`lib/okr-lark-capture.ts`) ghi lại MỌI tin nhắn Hiếu tự gửi hoặc được @mention (ở BẤT KỲ
  group nào bot có mặt) vào `okr_lark_message_log` — phục vụ real-time phát hiện case SLA/Vendor Speed cho tab
  My Metrics, KHÔNG liên quan luồng trả lời của Bé Gấu. Lỗi ở nhánh này không được (và không thể, vì
  fire-and-forget) làm hỏng luồng chính. Chi tiết đầy đủ: `docs/wiki/Tab/analytics-my-metrics.md` mục "s173".
- **⚠️ Gotcha nghiêm trọng (s159→s176, đã fix): `verifyLarkSignature` sai key ký → reject 100% webhook
  thật.** Từ s159 (2026-08-24) code ký HMAC-SHA256 bằng `LARK_VERIFICATION_TOKEN`; spec Lark khi app bật
  Encrypt Key yêu cầu `sha256(timestamp+nonce+LARK_ENCRYPT_KEY+rawBody)` (SHA256 thường, dùng Encrypt Key
  chứ không phải Verification Token) → suốt khoảng thời gian đó **Bé Gấu Lark không nhận được request thật
  nào** (mọi POST bị `console.warn("[Lark] signature mismatch")` rồi trả 200 im lặng). Nếu sau này lại thấy
  Bé Gấu "không trả lời trên Lark", kiểm tra ngay dòng log này trước khi nghi ngờ chỗ khác — xem
  `docs/wiki/Tab/analytics-my-metrics.md` mục "s176" (nơi bug này được phát hiện, dù không liên quan trực
  tiếp My Metrics) để biết cách tra bằng Vercel runtime log.

## 5. Phân Quyền Truy Cập
- **Standard**: Chỉ được dùng các agent `tu-van`, `tra-cuu`, `giai-dap`, `gap-analysis` theo phòng ban. Không được xem giá vốn (COGS), không được dùng BI Analyst.
- **Staff / BOD / Manager / Admin**: Có quyền kích hoạt Agent `bi-analyst` để truy vấn dữ liệu kinh doanh gohub_dw (đối với Staff/BOD thì bị giới hạn phạm vi dữ liệu theo quyền được phân).

---

## 6. Cải tiến s106 (2026-07-18) — audit + tối ưu 7 agent

Bộ E2E `web/src/__e2e__/agent-audit|agent-grade` (LLM-judge) audit từng agent vs DB thật rồi chấm chất lượng câu trả lời. Chi tiết: [[chatbot-agents-guardian|Chatbot Agents & Guardian]] §"Test harness". Các fix chính:

- **bi-analyst**: 🔒 PII — chỉ trả `customer_code`, KHÔNG lộ tên/SĐT/email khách. Glossary chỉ số: **CM1 = Gross Profit − Operation Cost**; Operation Cost KHÔNG có trong gohub_dw → không đánh đồng CM1 = Gross Profit. Cảnh báo bảng mirror `fact_fulfilment_revenue_power_bi` (1 chữ "l" — đếm trùng, không dùng). `dim_location` = **kho/chi nhánh** (không phải nước); eSIM/3HK fulfill `location_id=0` ('Unknown') → giải thích thay vì "không có dữ liệu". Fallback chống câu trả lời rỗng (function-calling ≤10 vòng).
- **Định tuyến (router)**: "báo cáo 3HK **trong/theo kho** Hà Nội" → `bi-analyst` (không nhầm gap-analysis); "3HK **Contribution** %" không bị `3hk co` nuốt (word-boundary); "khách **mua nhiều nhất**" → bi-analyst; "liệt kê wiki" / "đếm item theo kênh" → data-explorer; câu **gap NCC** ("WM có bao nhiêu gói **chưa tạo** SKU") không bị BI override cướp → gap-analysis.
- **tu-van đa quốc gia (multi-country)**: câu "gói dùng được ở **CẢ Malaysia VÀ Singapore**" → `searchSkusMultiCountry` giao tập nhóm nước phủ ĐỒNG THỜI mọi nước hỏi (extractParams gom `countries[]` khi có "cả…và / đồng thời / cùng lúc"; không nhầm "so sánh Nhật và Hàn"). GoHub CÓ ~21 nhóm phủ cả Malaysia+Singapore (AP2/APA…). Nước ngoài danh mục (vd Monaco) → báo "chưa có" thay vì hỏi lại.
- **giai-dap**: bổ sung glossary chỉ số kinh doanh (Revenue/GP/GPM%/CM1/CM1%/3HK Contribution).

### UX: hiệu ứng "đang trả lời"
Agent `bi-analyst`/`data-explorer` chạy function-calling 10–30s (non-stream) → trước đây bong bóng rỗng, trông như treo. Nay hiện **typing dots + "[tên agent] đang trả lời…"** trong bong bóng khi chưa có nội dung, badge nhấp nháy ở header (mọi kích thước màn hình). File `web/src/app/(dashboard)/chatbot/page.tsx`.

## 7. s196+13 (2026-09-13) — Fix await bug + cost tracking + eval case bảo mật + feedback loop

Theo roadmap audit toàn diện Bé Gấu (s196+5, xem artifact riêng). 4 việc từ nhóm "nên làm sớm":

- **Fix P0 — `detectAndLogLearning()` fire-and-forget**: `be-gau.ts` trước gọi `void detectAndLogLearning(...)`
  (dòng ~538) — đúng lớp bug đã tốn nhiều session tìm/fix trước đây (`logChat`/`app_usage_events` s195+18-C):
  serverless có thể đóng execution context trước khi promise học liệu kịp gửi đi. Đổi sang `await` — hàm tự
  bọc try/catch nội bộ nên an toàn, không chặn lâu (43 test be-gau vẫn PASS, verify tốc độ không đổi đáng kể).
- **Cost/token tracking**: `runBeGau()` tích luỹ `usageMetadata` qua MỌI vòng `genWithRetryStream` (đúng
  pattern đã làm cho Gấu Pro s196+7), trả thêm `tokensIn`/`tokensOut`. Cả 2 điểm vào (`api/chat/route.ts`
  `logChat()` và `api/lark/events/route.ts`) ghi thêm `tokens_in`/`tokens_out`/`est_cost_usd` vào
  `app_usage_events` — tái dùng ĐÚNG 3 cột đã thêm ở migration v58 cho Gấu Pro, KHÔNG cần migration mới.
  Giá dùng `lib/agents/gemini-pricing.ts` (đã verify `ai.google.dev/gemini-api/docs/pricing`).
- **Eval case bảo mật qua LLM thật** (`__e2e__/agent-banks.ts`, nhóm DX): trước chỉ có case `role:"admin"`
  xác nhận ĐỌC ĐƯỢC bảng nhạy cảm (`users`/`app_settings`...) — thêm 2 case `role:"staff"` xác nhận executor
  CHẶN đúng qua đường LLM thật (khác unit test `be-gau-runner.test.ts` chỉ test `listSupabaseTables`, chưa
  test `querySupabase` trực tiếp). Cần Hiếu tự chạy (máy dev không có `.env.local`):
  `GRADE_AGENT="data-explorer" npx vitest run --config vitest.audit.config.ts src/__e2e__/agent-grade.test.ts`.
- **Feedback loop 👍/👎**: nút thumbs-up/down dưới mỗi câu trả lời Bé Gấu trên web (`chatbot/page.tsx`,
  component `BeGauMsgContent`) — trước non-creator không có cách nào đánh giá trực tiếp chất lượng câu trả
  lời (chỉ creator/admin xem qua Usage Analytics/LLM-judge nội bộ). Ghi vào bảng mới `chat_feedback`
  (migration `v59_chat_feedback.sql`, route `POST /api/chat/feedback`, rate-limit 30/phút/user) — tách riêng
  `app_usage_events` (đã nhiều cột, feedback là hành động chủ động khác event tự động). 1 lần/tin nhắn
  (client chặn double-click qua state `feedbackGiven`).

tsc + lint (0 lỗi mới) + vitest (230/230) PASS. **Cần Hiếu**: chạy migration v59; muốn xem cost Bé Gấu thì
tự thêm 1 card lọc `agent_id="be-gau"` vào Usage Analytics (KpiCard "Chi phí Gấu Pro" hiện có chỉ lọc
`gau_pro`, chưa gộp — để riêng cho rõ vì đối tượng khác nhau, xem quyết định #2 trong artifact roadmap).
## § s228 U3a (2026-10-08) — Bảng phân quyền tính năng theo vai trò + cổng an toàn chung

- **Bảng tính năng** `lib/assistant-features.ts` (lưu `app_settings.assistant_features` = `{featureId: role[]}`, cache 60s). 3 nhóm:
  *Mọi người* (mặc định bật mọi vai trò: tìm web, so giá vendor, win-rate SKU, xu hướng, Lark Base, tạo ảnh),
  *Theo quyền* (mặc định chỉ admin: mở trang web `browseWeb`, tạo video), *Chỉ Creator* (khoá cứng: ghi KB/duyệt học liệu, portal
  vendor, gửi Lark cho người khác, task Lark của Hiếu, ảnh Stability). Mục "Sắp có" (kế hoạch+Dừng, trí nhớ, chạy nền, đọc to,
  ghi âm→biên bản, Trực tiếp, việc theo lịch, nghiên cứu sâu, dịch, Bridge, file máy) hiện trong bảng nhưng chưa có tác dụng.
- Giao diện: Creator Settings → khối "Bé Gấu — Tính năng theo vai trò" (`assistant-features-section.tsx`); API
  `GET/POST /api/config/assistant-features` (xem creator/admin, sửa chỉ creator).
- Bé Gấu: tool lõi (SQL, Supabase, sản phẩm, KB, GA4/GSC, `larkWorkspace`, `searchKnowledgeBase`) luôn có; tool Gấu Pro khai báo theo
  bảng. **Đổi hành vi**: trước admin có cả nhóm "Chỉ Creator" trong Bé Gấu — nay chỉ creator (theo plan U3).
- **Cổng an toàn chung** (`creator/tool-policy.ts`): Bé Gấu ghi nhận lượt đã đọc nội dung ngoài (web, file, Lark Base, xu hướng) → chặn
  hành động ghi/gửi/mở URL lạ (chưa có nút Duyệt ở Bé Gấu → báo người dùng gửi lại ở tin mới).
- **Ngân sách thời gian 240s** cho Bé Gấu + Gấu Pro web: QA 2026-10-08 Gemini chậm bất thường (20s–2,5 phút/lượt, cả production)
  → Gấu Pro chạm trần 300s, UI "Không có nội dung trả về". Nay hết 240s thì chốt 1 lượt trả lời bằng dữ liệu đã có (không gọi tool).

## § s228 U3b (2026-10-08) — Bé Gấu: kế hoạch từng bước, nút Dừng, trí nhớ

- `/api/chat` đổi sang **SSE** (`data: {json}\n\n`, sự kiện `agent` / `delta` / `plan` / `done`) — trước là chữ thô + dòng `__AGENT__:`.
  Trang `chatbot/page.tsx` đọc SSE, hiện khung "Kế hoạch" (checklist) khi đang chạy, nút Gửi thành nút **Dừng** khi đang chạy
  (AbortController → `req.signal` → vòng lặp dừng, câu trả lời dở giữ lại + "⏹ Đã dừng theo yêu cầu.").
- Tính năng "Kế hoạch từng bước" (tool `updatePlan`, xử lý tại chỗ, không ghi gì) mặc định bật mọi vai trò.
- Tính năng "Trí nhớ + tìm hội thoại cũ" (`assistantMemory`, `searchPastConversations`, nạp khối trí nhớ mỗi lượt, sau lượt rút điều đáng
  nhớ + tóm tắt hội thoại) **mặc định TẮT** — Hiếu bật theo vai trò ở bảng tính năng. Trang gửi `conversation_id` để tóm tắt; link kết quả
  tìm hội thoại: tiêu đề "[GP] …" → Gấu Pro, còn lại → `/chatbot?c=<id>` (trang Bé Gấu mở thẳng hội thoại theo `?c=`).

## § s228 (2026-10-08) — Bộ lọc lộ tên bảng/cột trong câu trả lời Bé Gấu

- Eval U1b câu #1/#15 lộ "(`staff_code`)", "(`ref_countries`)" dù prompt cấm → thêm `core/leak-filter.ts`: xoá code nội dòng dạng
  snake_case (kèm ngoặc bao quanh) ở chữ stream ra (giữ lại phần có thể là đoạn code chưa đóng) và ở câu trả lời cuối. Không đụng
  khối ``` (khối export chứa SQL thật), mã SKU viết hoa, từ thường. Test `leak-filter.test.ts` (stream từng ký tự = lọc cả đoạn).

## § s228 (2026-10-08) — Tool `b2bCustomerCm1` (CM1 B2B theo khách hàng)

- `lib/agents/b2b-cm1.ts` gọi THẲNG handler `GET` của `/api/analytics/quarterly-b2b-customers` (kèm `Bearer CRON_SECRET`) → số khớp tuyệt
  đối tab Quarter Report (chi phí KH Turso, pro-rata tháng đang chạy, Group Cost B2B phân bổ ở mức nhóm), không viết lại công thức.
  Lọc theo tên/mã KH, nhóm (tier), top N, tuỳ chọn số từng tháng. CM1 từng KH chưa trừ Group Cost; CM1 tổng nhóm đã trừ.
- Chỉ khai báo khi vai trò xem được giá vốn VÀ không có `role_filters` giới hạn dữ liệu (route không áp bộ lọc vai trò).

## § s228 (2026-10-08) — Bé Gấu: Trò chuyện trực tiếp theo vai trò

- Tính năng "Trò chuyện trực tiếp" (nhóm Theo quyền, mặc định chỉ admin) — nút "🎙 Trực tiếp" trên trang Bé Gấu hiện khi vai trò được bật
  (`GET /api/chat/features` trả danh sách tính năng bật cho vai trò hiện tại).
- `runBeGau` tách phần chuẩn bị thành `prepareBeGau()` (prompt + tool theo vai trò/tính năng + `runTool` có cổng an toàn và lọc giá vốn);
  `promptless: true` chỉ dựng phần chạy tool. Phiên Live Bé Gấu (`lib/agents/be-gau-live.ts`) dùng hàm này → cùng lọc vai trò như chat,
  KHÔNG đi đường tool Gấu Pro (đường đó không áp lọc theo vai trò). Chỉ tool ĐỌC (`BE_GAU_LIVE_TOOLS`), không có thao tác Chrome.
- Route: `/api/chat/live/token` | `tool` | `log` (phụ đề lưu thành hội thoại "🎙 …" trong Bé Gấu). Tạo token dùng chung với Gấu Pro:
  `lib/agents/live-token.ts`. Component `components/gau-pro/live-session.tsx` thêm prop `apiBase`/`title`/`allowControl`.

## § s228 (2026-10-08) — Bé Gấu: chạy nền việc dài

- Tính năng "Chạy nền việc dài" (Mọi người, mặc định bật). Nút ⏳ cạnh ô nhập → tin gửi đi thành việc nền (`POST /api/chat/jobs`).
- Dùng CHUNG bảng + bộ chạy `gp_jobs` của Gấu Pro (không migration): việc Bé Gấu đánh dấu `checkpoint.agent = "be-gau"` (+ `ownerName`,
  `contents`, `tainted`). `runJobChunk` rẽ sang `runBeGauJobChunk`: đọc lại `users.role` mỗi chặng, chạy `runBeGau({ job })` — hết ngân sách
  200s trả checkpoint (giữ trạng thái đã đọc nội dung ngoài), tối đa 6 chặng. Xong: hội thoại "⏳ …" lưu theo TÊN hiển thị + Lark DM.
- ⚠️ Hội thoại Bé Gấu lọc theo `session.user.name` (không phải username) — phụ đề phiên Trực tiếp đã sửa lưu theo tên.
- `core/agent-loop.ts`: ngân sách thời gian so `!= null` (trước `0` bị bỏ qua).

## § s228 (2026-10-08) — Bé Gấu: đọc to câu trả lời (TTS)

- Tính năng "Đọc câu trả lời" (Mọi người, mặc định bật): nút 🔊 dưới mỗi câu trả lời → `POST /api/chat/tts` → audio/wav, bấm lại để dừng.
- Model `GEMINI_TTS_MODEL` (mặc định `gemini-3.8-flash-tts`, trả thẳng WAV; đo ~4s/câu ngắn), giọng "Kore". `lib/speech-text.ts` bỏ khối
  code/chart/export, thay bảng bằng "(Bảng số liệu xem trên màn hình.)", cắt ở 2.500 ký tự. Giới hạn 10 lần/phút/người.

## § s228 (2026-10-08) — Bé Gấu: ghi âm cuộc họp → biên bản

- Tính năng "Ghi âm → biên bản" (Mọi người, mặc định bật): nút 🎤 (ghi âm trên trình duyệt, opus 16kbps) + nút tải file ghi âm, cạnh ô nhập
  (`components/be-gau/meeting-recorder.tsx`) → `POST /api/chat/transcribe` (multipart `audio`). Kết quả vào hội thoại đang mở như 1 lượt hỏi–đáp.
- 2 bước: `GEMINI_TRANSCRIBE_MODEL` (mặc định `gemini-3.5-transcribe`, trả part `audioTranscription.text`, không tách người nói, ~2,5s/câu)
  → `GEMINI_MODEL` viết biên bản (tóm tắt, nội dung, quyết định, bảng việc cần làm, câu hỏi mở), có danh sách thuật ngữ để sửa chỗ nghe nhầm.
- Gotcha đo được: model chép lời BỎ QUA gợi ý thuật ngữ (gửi kèm text không đổi kết quả); hay nhầm "Gighub"→"GitHub", "Hiếu"→"Hiểu".
- Giới hạn: body request Vercel ~4,5MB → tối đa ~4,4MB (≈ 35 phút ở 16kbps); họp dài hơn cần upload qua kho file (chưa làm).

## § s228 (2026-10-08) — Bé Gấu: việc theo lịch

- Tính năng "Việc theo lịch" (Theo quyền, mặc định chỉ admin) → tool `scheduleTask` (create/list/cancel) trong Bé Gấu.
- Dùng chung bảng `gp_scheduled_tasks` (không migration): việc đặt từ Bé Gấu lưu `schedule.agent = "be-gau"` + `schedule.ownerName`;
  `runDueSchedules` tạo việc nền có dấu Bé Gấu → chạy `runBeGau` theo vai trò người đặt; việc canh chừng trả `NO_ALERT` thì không lưu/nhắn.
- Kết quả: Lark DM (cần `users.lark_open_id`) + hội thoại "⏳ …". Cron `scheduled-messages` mỗi giờ → trễ tối đa ~1 giờ (đang trỏ staging).
- Cổng an toàn: tạo lịch sau khi lượt đã đọc nội dung ngoài → bị chặn (rule `when_tainted`).

## § s228 (2026-10-08) — Bé Gấu: nghiên cứu sâu (Deep Research)

- Tính năng "Nghiên cứu sâu" (Theo quyền, mặc định chỉ admin) → tool `deepResearch` (`lib/agents/deep-research.ts`): tạo phiên
  `ai.interactions.create({ agent: GEMINI_DEEP_RESEARCH_AGENT, background: true })` (mặc định `deep-research-preview-04-2026`) + 1 việc nền
  `gp_jobs` với `checkpoint = { agent: "deep-research", interactionId, ownerName }`. Bộ chạy hỏi trạng thái mỗi 15s trong chặng 200s,
  tối đa 12 chặng (~40 phút, quá thì huỷ). Xong: `output_text` (markdown, cuối có danh sách nguồn) → hội thoại "🔎 …" + Lark DM.
- Chỉ gửi CÂU HỎI ra ngoài (kèm bối cảnh GoHub chung), không kèm dữ liệu nội bộ. Đo: câu giá eSIM Nhật 7 ngày 136s, ~114k token.
- `/api/chat` truyền `origin` cho `runBeGau` để tự gọi bộ chạy việc nền.

## § s228 (2026-10-08) — Bé Gấu: dịch trực tiếp (CS)

- Tính năng "Dịch trực tiếp" (Theo quyền, mặc định chỉ admin — bật cho Ops & CS khi cần): nút "🌐 Dịch trực tiếp" → `components/be-gau/translate-session.tsx`.
- `POST /api/chat/translate/token { lang }` cấp 2 token Live (`GEMINI_TRANSLATE_MODEL`, mặc định `gemini-3.5-live-translate-preview`,
  `translationConfig`): khách → tiếng Việt và nhân viên → tiếng khách. 13 ngôn ngữ. `live-token.ts` thêm tuỳ chọn `model` + `translationConfig`.
- Gotcha đo được: `echoTargetLanguage: false` VẪN phát âm thanh (không ra chữ) khi nghe đúng ngôn ngữ đích → không thể để 2 phiên cùng nghe
  1 mic; giao diện có 2 nút "Khách đang nói" / "Tôi đang nói", mic chỉ gửi vào phiên của chiều đang chọn. Không lưu hội thoại.

## § s228 U2 (2026-10-08) — Báo cáo đẹp: Word / Excel / PowerPoint / PDF

- Tool `buildReport` (Bé Gấu: mọi vai trò; Gấu Pro: có sẵn) — `lib/agents/report-tool.ts` → bộ dựng `lib/report/`:
  `spec.ts` (khung: title, period, summary, sections[heading, text, bullets, kpis, table, chart], actions, notes; định dạng số kiểu Việt),
  `charts.ts` (SVG tự dựng: bar/stacked/line/pie, màu gohub.vn; PNG qua `@resvg/resvg-js` + font Be Vietnam Pro trong `lib/report/fonts/`),
  `docx.ts`, `xlsx.ts` (exceljs: dòng tiêu đề xanh cố định, bộ lọc, #,##0 / 0.0"%", dòng Tổng là công thức SUM, ảnh biểu đồ), `pptx.ts`
  (pptxgenjs: bìa, kết luận, biểu đồ GỐC sửa được, bảng ≤12 dòng), `pdf.ts` (HTML + SVG in qua browserless — gói free ngủ, chờ kết nối 90s).
- **Số khớp SQL**: bảng/ô số kèm `sql` → server tự chạy (Bé Gấu qua `execSQL` có chặn giá vốn theo vai trò) và dùng số thật, bỏ số model gõ.
- File lưu bucket RIÊNG TƯ `reports/<username>/…` (tự tạo bucket); link `/api/chat/report-file?p=` kiểm đăng nhập + đúng người (admin/creator
  xem được hết) rồi chuyển sang link ký 60 giây.
- `next.config`: external `@resvg/resvg-js`, `exceljs`, `pptxgenjs`; `outputFileTracingIncludes` kèm file font. Test `report.test.ts`.
- Chưa có: chạy code Python, ghi thẳng vào Lark Docs kèm ảnh biểu đồ (U2 phần sau).

## § s228 U2b (2026-10-08) — Bé Gấu chạy code Python để tính toán

- Config Bé Gấu thêm built-in `{ codeExecution: {} }` cạnh function declarations + `toolConfig.includeServerSideToolInvocations: true`
  (thiếu cờ → API 400 "Please enable tool_config.include_server_side_tool_invocations"). Mọi lượt ép tool (Lark ANY, chốt NONE) phải giữ cờ.
- Đo: model gọi executeSQL trước, lượt sau tự viết + chạy Python (executableCode/codeExecutionResult) rồi trả lời. Prompt: tính nhiều số
  bằng code, không in code ra câu trả lời. `streamTurn` giữ nguyên các part code trong lịch sử.
