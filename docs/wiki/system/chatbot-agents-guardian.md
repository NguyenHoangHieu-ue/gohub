---
title: "Chatbot Agents & Guardian"
page_type: reference
department: tech
audience: system
visibility: admin-only
is_hidden: true
tags: [chatbot, agent, guardian, rbac, permission, ai, system]
aliases: ["Guardian", "Chatbot Agents", "Phân quyền chatbot", "Agent Routing"]
last_edited_by: ""
last_edited_at: ""
created: 2026-06-21
updated: 2026-08-22
status: active
---

# Chatbot Agents & Guardian

Chatbot GoHub dùng kiến trúc **multi-agent**: 1 router phân loại câu hỏi → chọn đúng 1 trong **7 agent** chuyên trách. Trước khi gọi agent, **Guardian** kiểm soát quyền hạn câu hỏi (vượt quyền / khác phòng ban → từ chối lịch sự).

> Sơ đồ luồng: [[system/Second-Brain-Architecture#Diagram 5 — 6 Agents + Guardian & Routing Logic|Diagram 5]]

---

## 7 Agent chuyên trách

| Agent | ID | Vai trò | Nguồn dữ liệu |
|---|---|---|---|
| **Tư Vấn** | `tu-van` | Tìm/đề xuất gói SIM/eSIM GoHub theo nước/khu vực/ngày/GB | skus + sku_catalog (4-step country fallback) |
| **Tra Cứu** | `tra-cuu` | Tra mã cụ thể (SKU/Product/Item/Listing), COGS, tỷ giá | products/skus/items + FX |
| **Giải Đáp** | `giai-dap` | Giải thích thuật ngữ, cấu trúc mã, chính sách, mã nhóm nước | KB + Wiki + vendor info |
| **NCC & Gap** | `gap-analysis` | Chủ sở hữu catalog NCC (WM/3HK); browse + so sánh gap với hệ thống | ncc_worldmove · ncc_3hk |
| **Tạo Template** | `tao-template` | Xuất file Excel template sản phẩm từ catalog WM/3HK | catalog NCC theo nước |
| **BI Analyst** (Bé Gấu Bi-Ai) | `bi-analyst` | Phân tích kinh doanh: doanh thu, đơn hàng, nhân viên, B2B/B2C, top SKU, traffic website, SEO | `executeSQL` → gohub_dw (GCP Postgres) · `queryGA4` → Google Analytics 4 · `queryGSC` → Search Console |
| **Kho Dữ Liệu** (🗄️, s95) | `data-explorer` | Truy xuất DỮ LIỆU THÔ toàn hệ thống — đếm/liệt kê/tra bảng nhanh | `executeSQL` gohub_dw + `querySupabase` (38 bảng catalog/config) + `listSupabaseTables` |

### Router = Capability Graph (định tuyến XÁC ĐỊNH — s108)

> **Vì sao đổi:** routing cũ dựa 1 call Gemini + chuỗi regex override đè nhau → CÙNG 1 câu lúc ra agent này, lúc ra agent khác ("lúc trả lời được, lúc không"). Nay dùng **đồ thị năng lực (capability graph)** làm hàm thuần, xác định.

- `web/src/lib/agents/graph.ts` — **capability graph**: `signal → intent → agent` qua các *edge* có `tier` (độ mạnh) + `precedence` (tie-break). `scoreAndSelect()` chọn agent hoàn toàn từ tín hiệu deterministic (mã SKU / tên nước / từ khoá doanh thu…). **Gemini classifier chỉ là 1 phiếu tier-1** — chỉ thắng khi KHÔNG có tín hiệu mạnh → tín hiệu mạnh luôn quyết ⇒ cùng câu luôn ra cùng agent.
- `tier`: 6 = template · 5 = tín hiệu xác định mạnh (definite-BI / usage / data-explore / explain-group) · 4 = mã cụ thể / gap / BI ranking · 3 = BI-chung / ncc / pricing / cogs / explain · 2 = tìm sản phẩm cơ bản / chào hỏi · 1 = phiếu LLM.
- `web/src/lib/agents/router.ts`: `extractParams()` (nước/khu vực/mã/vendor…) → dựng `SignalFlags` → `scoreAndSelect()`. Trả thêm `agentIds[]` + `multi`.
- **Bước hỏi lại**: câu quá mơ hồ (thiếu nước/khu vực/mã) → hỏi lại ngay, không gọi agent.

### Orchestrator — đa-agent + tổng hợp + đảm bảo trả lời (s108)
`web/src/lib/agents/orchestrator.ts`:
- **Đa-agent**: câu chạm ≥2 chủ đề **khác domain** (catalog / analytics / knowledge) + có liên từ (vd *"đi Nhật có gói nào **và** doanh thu tháng này bao nhiêu"*) → chạy song song N agent (tối đa 3) rồi `synthesize()` (1 call Gemini) gộp thành 1 câu mạch lạc, giữ nguyên số/bảng. Có guard tránh false-positive (nước/mã đi kèm câu BI = FILTER, không tách agent riêng). Trước khi chờ, bot báo `NOTICE_MULTI` ("đợi mình một xíu…").
- **ensureAnswer** (graph.ts): mọi đường ra được bọc — nếu agent trả rỗng / "không tìm thấy" / lỗi → thay bằng **gợi ý cách hỏi + 3 câu mẫu** đúng năng lực agent (`AGENT_EXAMPLES`). Mục tiêu: **luôn có câu trả lời**, không im lặng.
- Wired vào `/api/chat` (giữ streaming cho single-agent, non-stream cho multi), `lark/events`, và `answer.ts`.

---

## Guardian — cổng kiểm soát quyền hạn

`web/src/lib/agents/guardian.ts` · `guardCheck(message, role, department, opts?)` → `{ allowed, reason, category }`.

Chạy **song song** với router (zero thêm độ trễ). Nếu chặn → stream từ chối lịch sự (badge "Hạn chế quyền"), **không** gọi agent.

> **XÁC ĐỊNH (s108):** phân loại nhạy cảm nay bằng **regex** (`web/src/lib/agents/guardian-classify.ts` · `classifySensitivity()`), **KHÔNG gọi Gemini** nữa → cùng câu luôn ra cùng category (hết flip allow/deny) + bớt 1 vòng LLM mỗi tin nhắn. Thứ tự ưu tiên (mức nhạy cảm cao nhất thắng): `injection/jailbreak → system_internal → margin_cogs → staff_hr → customer_pii → revenue_bi → product_catalog → general`. Có `RE_BIZ_PROC` để quy trình **nghiệp vụ** (KYC / tạo SKU / đọc mã / chính sách giá) KHÔNG bị nhầm thành system_internal. Đánh đổi: injection ngụy trang rất tinh vi có thể lọt so với LLM (bù lại: admin/creator bypass, policy nới, quyết định ổn định).

### 8 category — CHỈ 1 ranh giới thật (cập nhật s190)

> Triết lý (chốt lại s190 lúc gộp Bé Gấu + Gấu Pro): mọi câu hỏi DỮ LIỆU — sản phẩm, doanh thu/đơn/kênh,
> khách hàng, giá vốn/CM1, lương/nhân sự, tài liệu phòng ban — **ai cũng như nhau, không phân biệt role**.
> CHỈ 1 nhóm bị chặn cứng: hỏi về chính con bot/code/hệ thống được build ra sao.

| Category | admin/creator | mọi role khác (bod/manager/staff/b2b/b2c/…) |
|---|---|---|
| product_catalog / general / revenue_bi / customer_pii / internal_kb_other_dept / margin_cogs / staff_hr | ✅ | ✅ — **luôn**, không có ngoại lệ |
| **system_internal** (code / cách hệ thống-chatbot **build** / stack-deploy-kiến trúc / quy trình **kỹ thuật** / credential / schema) | ✅ (role xác thực qua session — web/Lark-DM) | ❌ |

> **GIỚI HẠN DUY NHẤT = system_internal.** Bắt cả "hệ thống/chatbot được build như nào", "dùng công nghệ/stack gì", "deploy ra sao", "kiến trúc/CI-CD".
> ⚠️ **Phân biệt:** quy trình **NGHIỆP VỤ** (KYC, quy trình tạo SP/SKU, xử lý đơn, chính sách giá) **KHÔNG** phải system_internal → ĐƯỢC PHÉP trả lời. Chỉ "quy trình" mang tính code/kỹ thuật/build hệ thống mới chặn.
>
> **Giá B2B vs B2C:** không xử lý ở guardian — scope qua `getChannelFromRole(role)` và CHỈ ảnh hưởng **giá bán sản phẩm** (agent tra-cuu/tu-van): role `b2c`/`saleb2c`→B2C, `b2b`→B2B, role khác→thấy tất cả. Số liệu doanh thu BI không giới hạn theo kênh.

- Quyết định giờ **cứng trong code** (`guardian.ts`), không còn qua bảng cấu hình DB nào. ⚠️ **Lịch sử (đã xoá, s190+1)**: trước đây có `app_settings.access_policy` + route `/api/config/access-policy` cho phép admin tự đặt allow/deny/dept theo từng category × role qua 1 UI ở trang Cài đặt. UI đó bị xoá lúc gộp Bé Gấu/Gấu Pro (s190) nhưng route + cơ chế đọc override còn sót lại — dữ liệu CŨ trong bảng đó vẫn đang deny margin_cogs/staff_hr/customer_pii/system_internal cho staff/b2b/b2c/saleb2c/ops-&-cs/product, **âm thầm mâu thuẫn** với chủ trương "ai cũng như nhau" suốt từ lúc UI bị xoá tới khi Hiếu tự query lại thấy (không còn UI nào hiển thị nó để phát hiện sớm hơn). Đã xoá hẳn route + cơ chế đọc DB — sửa quyền thì sửa thẳng `DENY_REASONS`/logic trong `guardian.ts` (git-tracked, review được), không còn "cấu hình ẩn" nào lệch khỏi ý định đã chốt.
- **admin/creator**: bỏ qua hẳn phân loại category dữ liệu (chỉ còn check system_internal).
- **FAIL-OPEN**: classifier deterministic luôn trả confidence ≥ 0.8 nên hầu như không rơi vào fail-open; nhưng nhánh (< 0.6 → cho qua) vẫn giữ để an toàn.

### Lark group
Lark dùng trong group → không phân biệt được role (mọi người có thể là `standard`). Guardian ở Lark chạy chế độ riêng: `{ onlyCategories: ["system_internal", "customer_pii"], ignoreRole: true }` — chặn câu hỏi **nội bộ hệ thống** (bot hoạt động thế nào / workflow / code / prompt / schema) **và PII khách hàng cụ thể** → trả lời "bạn hỏi trực tiếp Hiếu nhé 😊". Nghiệp vụ (sản phẩm/doanh thu...) vẫn trả lời bình thường.

### Tránh chồng chéo
- `role_filters` (BI): lọc **row** dữ liệu trong SQL của BI Analyst theo role.
- `DISPLAY_RULES` (prompt agent): nhắc agent tự từ chối code/prompt nội bộ.
- **Guardian**: lấp gap ở mức **category + dept + intent**, chặn xác định trước khi gọi agent.

---

## Lưu ý kỹ thuật
- 🔴 **s195+18-C (2026-09-11) — P0 phát hiện qua QA My Metrics: tool-calling CHẾT HOÀN TOÀN từ lúc s195+18
  đổi sang streaming, đã fix.** Mọi câu hỏi cần tool (executeSQL/querySupabase/...) — cả Bé Gấu lẫn Gấu Pro
  — lỗi thẳng `400 Function call is missing a thought_signature` ngay từ vòng lặp tool-call đầu tiên. Root
  cause đọc trực tiếp source `@google/generative-ai@0.21.0` (`dist/index.js` hàm `aggregateResponses()`):
  khi gộp nhiều chunk stream thành 1 response, hàm này CHỈ copy đúng 4 field cố định mỗi part
  (text/functionCall/executableCode/codeExecutionResult) — làm rớt field `thoughtSignature` (field MỚI,
  ra đời sau SDK, model "thinking" dùng tool như gemini-3.8-flash bắt buộc phải có). Gemini API yêu cầu
  echo lại NGUYÊN VẸN thoughtSignature khi gửi lại chính functionCall đó ở lượt sau (đẩy vào `contents`
  cho vòng lặp tiếp theo) — thiếu thì model reject thẳng. Fix (`lib/agents/gemini-stream.ts`
  `genWithRetryStream()`): tự gom `parts` từ RAW chunk (spread giữ nguyên mọi field, không lọc như SDK)
  rồi ghi đè vào `content.parts` của response đã aggregate trước khi trả về — `.text()`/`.functionCalls()`
  (helper của SDK) đọc thẳng `candidates[0].content.parts` mỗi lần gọi (không cache tại thời điểm gắn
  helper) nên ghi đè sau vẫn hoạt động đúng, không cần sửa gì ở `be-gau.ts`/`creator-ai.ts`.
  **Bug đi kèm cùng đợt QA, cùng gốc "fire-and-forget trên serverless"**: `logChat()`
  (`api/chat/route.ts`) và 2 chỗ insert `app_usage_events` mới ở `api/lark/events/route.ts` (s195+18-B)
  không `await` — verify được 2 lần liên tiếp MẤT HẲN dòng log dù trả lời đúng (Vercel đóng execution
  context trước khi Supabase insert kịp gửi đi, cùng lớp rủi ro wiki đã ghi cho Lark ở mục dưới nhưng lúc
  đó chưa áp dụng triệt để). Đã đổi cả 3 chỗ sang `await`. Production (`main`) KHÔNG dính bug P0 này —
  chưa merge tới `425b862a` (commit stream token gốc) tính tới lúc phát hiện.
- **s195+18 (2026-09-10) — Stream token THẬT cho cả Bé Gấu lẫn Gấu Pro (fix gốc, không còn vá triệu chứng).**
  Tiếp mục "chưa làm" nêu ở s195+17. Trước đây CẢ 2 agent `await` xong TOÀN BỘ vòng lặp function-calling
  (tới 12/20 iteration) mới trả 1 cục text duy nhất cho user — dù bọc `ReadableStream`/SSE, user vẫn thấy
  màn hình trắng suốt thời gian chờ (root cause thật của s195+14, lúc đó chỉ vá triệu chứng bằng nâng
  `maxDuration` 60→300, chưa fix gốc). Đổi cả 2 agent dùng `model.generateContentStream()` (SDK
  `@google/generative-ai` v0.21.0 hỗ trợ sẵn, có sẵn field `.stream` async-generator + `.response` promise
  tổng hợp) THAY VÌ `generateContent()` ở MỌI vòng gọi model (kể cả vòng có tool-call — vòng đó thường
  KHÔNG có text vì system prompt cấm model narrate bước kỹ thuật, nên forward chunk không lộ gì; vòng trả
  lời cuối thì text chảy thẳng ra user theo từng đoạn model sinh ra thật). Helper dùng chung
  `genWithRetryStream()` tách ra `lib/agents/gemini-stream.ts` (dùng cho cả `be-gau.ts` VÀ `creator-ai.ts`
  — tránh lặp lại đúng kiểu duplicate code vừa fix ở s195+17) — giữ nguyên shape `{ response }` như
  `generateContent()` cũ nên toàn bộ code downstream (`.text()`/`.functionCalls()`/`.candidates`) KHÔNG
  đổi gì; retry transient error (429/5xx/timeout...) chỉ áp dụng khi CHƯA emit chunk nào ra user trong vòng
  đó — tránh lặp lại text đã hiện nếu phải retry.
  **Bé Gấu** (`be-gau.ts` + `api/chat/route.ts`): thêm `onChunk` callback, route enqueue từng delta ngay
  khi runBeGau() sinh ra — bỏ hẳn `controller.enqueue(encoder.encode(text))` cũ (tránh lặp đôi nội dung).
  FE (`chatbot/page.tsx`) **KHÔNG cần sửa gì** — code đọc stream sẵn có kiểu `while(true){reader.read()}`
  append từng chunk vào state, đã đúng ngay khi backend gửi nhiều chunk nhỏ thay vì 1 chunk to.
  **Gấu Pro** (`creator-ai.ts` + `api/creator-ai/chat/route.ts` + FE `analytics/creator/ai/page.tsx`): thêm
  event `{type:"delta", content}` mới vào union `GPEvent` (giữ nguyên event `"text"` cũ — vẫn gửi 1 lần ở
  CUỐI mang full text, làm nguồn sự thật lưu DB/backward-compat). FE thêm bubble placeholder rỗng ngay khi
  bắt đầu gửi, nối dần theo từng `delta` event (`setMessages` progressive, giống pattern Bé Gấu) — TRƯỚC
  ĐÓ Gấu Pro chỉ update UI 1 lần y hệt Bé Gấu dù ĐÃ có hạ tầng SSE + status event real-time (status thì có,
  nội dung câu trả lời thì không). Catch lỗi giữa chừng giờ NỐI THÊM lỗi vào phần đã stream thay vì xoá
  trắng thay thế (tránh "flicker" nội dung đã hiện rồi biến mất).
  **Test**: mock Gemini SDK ở `be-gau.test.ts`/`be-gau-runner.test.ts` phải thêm `generateContentStream`
  (trước chỉ mock `generateContent`) — implement bằng cách delegate gọi lại `generateContent` mock rồi bọc
  thành `{stream: async-generator 1 chunk, response: Promise}`, giữ nguyên mọi chuỗi `mockResolvedValueOnce`
  nhiều vòng đã viết sẵn cho từng test (không phải viết lại). tsc + lint (0 lỗi mới) + vitest (216/216)
  PASS. **Cần Hiếu**: QA cả 2 agent trên staging — xác nhận chữ CHẠY DẦN thay vì bung 1 cục, không lặp/mất
  nội dung, sources/export marker vẫn hoạt động đúng ở cuối câu trả lời.
- **s195+17 (2026-09-10) — Đổi model TOÀN BỘ AI trong Intel sang `gemini-3.8-flash` + đánh giá/nâng cấp
  Gấu Pro.** Tiếp s195+16 (khi đó chỉ đổi `be-gau.ts`, các agent khác giữ nguyên). Hiếu yêu cầu mở rộng ra
  toàn bộ + đánh giá riêng Gấu Pro. Đã đổi model ở 17 file: `bi-analyst.ts`/`data-explorer.ts`/
  `orchestrator.ts`/`classifier.ts`/`answer.ts` (pipeline cũ), `creator-ai.ts` (Gấu Pro), `mrp.ts`,
  `okr-lark-classify.ts` (giữ nguyên `maxOutputTokens=4000` — safety net cũ không phụ thuộc field
  thinking, không đụng), `web-search.ts`, `weekly-report/narrative.ts`, `creator/tools/portal.ts`,
  `creator/compress.ts`, usage-stats classify/evaluate, Tổ Gấu AI route, `config/schema/ai-suggest`
  (đổi field cũ `thinkingBudget:0` → `thinkingLevel:"minimal"` — field mới đúng cho 3.8-flash, field cũ có
  nguy cơ 400 trên model mới, xem gotcha `okr-lark-classify.ts` bên dưới). `creator-ai.ts` (model chính Gấu
  Pro) thêm `thinkingConfig.thinkingLevel:"low"` cùng lý do đã áp cho `be-gau.ts` (s195+16).
  **Đánh giá Gấu Pro** (đọc trực tiếp `creator-ai.ts` 754 dòng + `api/creator-ai/chat/route.ts` +
  `dispatch.ts`): ưu điểm — SSE thật với status event real-time mỗi tool call (`onEvent`/`emit`, UX tốt
  hơn Bé Gấu hẳn lúc chờ), 20+ tool phong phú, system prompt cá nhân hoá sâu (OKR Q3 Hiếu, expert persona
  theo domain, pipeline product-onboarding 7-bước), `maxDuration=300` đúng từ đầu (không dính bug timeout
  như Bé Gấu s195+14). Nhược điểm/bug thật phát hiện khi đọc — **đã fix ngay**: (1) `api/creator-ai/chat/
  route.ts` có `compressHistory`/`stripBase64Images` COPY Y HỆT từ `creator/compress.ts` (dùng chung đúng
  cách ở `be-gau.ts` nhưng route Gấu Pro thì không) — xoá bản trùng, route giờ import từ module dùng chung
  (chỉ còn 1 chỗ cần đổi model khi cần sau này). (2) Hàm `combineFileContexts` định nghĩa trong route
  nhưng KHÔNG được gọi ở đâu — dead code, đã xoá. (3) Vòng lặp tool-call (`runCreatorAI` + `be-gau.ts`
  cùng lỗi) — `Promise.all(calls.map(dispatchTool))` KHÔNG bọc try/catch riêng từng tool: 1 tool lỗi
  (network timeout portal/video API...) làm reject CẢ round, sập toàn bộ câu trả lời dù tool khác đã chạy
  xong. Đã bọc try/catch quanh từng tool call (cả `creator-ai.ts` lẫn `be-gau.ts`) — tool lỗi giờ chỉ trả
  `functionResponse` báo lỗi cho đúng tool đó, phần còn lại tiếp tục bình thường. **Chưa làm (đề xuất, cần
  bàn thêm trước khi làm — thay đổi kiến trúc lớn hơn)**: text trả lời cuối vẫn "await hết rồi enqueue 1
  lần" ở CẢ 2 agent (status event thì real-time, nhưng nội dung câu trả lời thật thì không stream token) —
  fix đúng gốc cần đổi cách Gemini SDK stream + FE parse, rủi ro cao hơn, để riêng nếu Hiếu muốn làm tiếp.
  tsc + lint (0 lỗi mới) + vitest (216/216) PASS. **Cần Hiếu**: QA cả Bé Gấu lẫn Gấu Pro trên staging (1
  câu BI nhiều bước mỗi bên) — đúng/không chậm/không lỗi JSON; theo dõi Gemini API cost.
- **s195+16 (2026-09-10) — Bé Gấu đổi model `gemini-3.6-flash` → `gemini-3.8-flash`.** Theo yêu cầu Hiếu
  đánh giá toàn diện + nâng cấp. Verify qua WebSearch trước khi đổi (không đoán): model có thật, GA, nhưng
  **mặc định thinking level = medium nếu không set** (billable, thêm latency ẩn) — đúng lớp rủi ro repo đã
  từng dính (gemini-3.5-flash thinking model cần `thinkingBudget=0` mới ổn định JSON — xem mục dưới; và
  gemini-2.0-flash bị khai tử im lặng 6 ngày s194+7). Set tường minh `generationConfig.thinkingConfig.thinkingLevel`
  (SDK `@google/generative-ai` v0.21.0 pin cứng chưa có type field này, ra đời sau SDK → `as any`):
  `"low"` cho model chính (vòng lặp function-calling, cân bằng lợi ích tool-orchestration của 3.8 vs latency
  budget vừa mới nâng — s195+14, maxDuration 60→300) · `"minimal"` cho call JSON 1-shot của
  `detectAndLogLearning` (không cần suy luận sâu, cần nhanh + JSON ổn định). **CHỈ đổi `be-gau.ts`** — các
  agent khác (Gấu Pro `creator-ai.ts`, pipeline cũ `bi-analyst.ts`/`data-explorer.ts`/`orchestrator.ts`/
  `classifier.ts`/`answer.ts`, Tổ Gấu AI, usage-stats classify/evaluate) VẪN `gemini-3.6-flash` — ngoài scope
  yêu cầu lần này, đổi sau nếu Hiếu muốn. tsc + lint (0 lỗi mới) + vitest (216/216) PASS. **Cần Hiếu**: QA
  1 câu hỏi BI phức tạp (nhiều tool-call) trên staging — xác nhận vẫn trả lời đúng, không chậm hơn rõ rệt,
  không lỗi JSON/im lặng; theo dõi Gemini API cost vài ngày đầu (thinking tokens tính phí).
- **Guardian không còn gọi Gemini** (s108) — phân loại nhạy cảm bằng regex. Routing classifier (`classifier.ts`) vẫn dùng Gemini nhưng chỉ là **phiếu tier-1** trong graph (không quyết một mình).
- Model `gemini-3.5-flash` là **thinking model**: khi còn dùng cho classifier, phải set `generationConfig.thinkingConfig.thinkingBudget = 0` mới trả JSON ổn định (nếu không, token bị tiêu vào "thinking" → output cụt → JSON.parse lỗi).
- **Lark bot trên Vercel/Netlify**: KHÔNG dùng `waitUntil` (không hỗ trợ trên Next 14 App Router). Xử lý **đồng bộ** (await rồi mới trả 200). Chống Lark retry: dedup `event_id` qua `app_settings.larkevt:<id>`.
- **s195+14 (2026-09-09) — fix timeout thật, không phải bug code**: Hiếu báo Bé Gấu trả lời quá lâu thì
  không có câu trả lời gì cả. Verify qua Vercel Runtime Errors log: `Vercel Runtime Timeout Error: Task
  timed out after 60 seconds` — đúng route `/api/chat`, lần gần nhất đúng lúc Hiếu vừa gặp. `runBeGau()`
  await xong TOÀN BỘ (kể cả nhiều vòng tool-call BI) mới `controller.enqueue()` 1 lần — không stream token
  thật dù bọc `ReadableStream` — nên câu hỏi phức tạp/nhiều tool-call dễ vượt 60s, Vercel giết function giữa
  chừng TRƯỚC KHI catch-block kịp trả message lỗi thân thiện → user thấy im lặng hoàn toàn. `maxDuration`
  vốn đã set đúng 60 = trần cứng Hobby plan (không phải quên set). Fix: nâng `maxDuration` 60→300 (`web/vercel.json`
  + `api/chat/route.ts`) — Hobby + Fluid Compute cho phép tới 300s không cần nâng gói. Cùng fix cho
  `/api/lark/events` (cũng gọi `runBeGau()` đồng bộ y hệt, cùng lớp rủi ro). Đã kiểm tra không có
  AbortController/timeout nội bộ nào khác (be-gau.ts, FE fetch) cần nâng theo.
- Liên quan: [[kien-truc-he-thong|Second Brain Architecture]] · [[../business/vendor-worldmove|WorldMove]] · [[../business/vendor-3hk|3HK]]

---

## Test harness đánh giá agent (session tối ưu 7 agent — 2026-07-18)

Bộ E2E kiểm chất lượng **câu trả lời** (không chỉ routing), chạy DB + Gemini thật:
- `web/src/__e2e__/agent-audit.test.ts` — introspect gohub_dw (13 bảng) + probe 38 bảng Supabase, đối chiếu kiến thức trong prompt vs DB thật (phát hiện bảng agent chưa biết / catalog lệch).
- `web/src/__e2e__/agent-grade.test.ts` + `agent-banks.ts` — bank câu hỏi/agent, chạy `answerQuestion()` rồi **LLM-judge** (Gemini chấm rubric must/mustNot). Chọn agent: `GRADE_AGENT="bi-analyst"` hoặc `"a,b,c"` hoặc `"all"`. Chạy song song pool 3.
- `web/src/lib/agents/answer.ts` — `answerQuestion()`: pipeline non-stream dùng CHUNG, mirror `/api/chat` (route→guardian→clarify→context→agent) để test bám code thật.
- Config: `vitest.audit.config.ts`. Regression routing: `chatbot-routing.test.ts` (32 câu, 32/32).
- Chạy: `npx vitest run --config vitest.audit.config.ts src/__e2e__/agent-grade.test.ts --disableConsoleIntercept`

### Lỗi đã sửa qua audit
- **bi-analyst**: (1) rào PII — chỉ trả `customer_code`, KHÔNG tên/SĐT/email khách (trước bị leak "Anh Công…"); (2) glossary chỉ số — CM1 = GP − Operation Cost, mà Operation Cost KHÔNG có trong gohub_dw → không đánh đồng CM1 = Gross Profit; (3) cảnh báo bảng mirror `fact_fulfilment_revenue_power_bi` (1 chữ "l") KHÔNG dùng (đếm trùng); (4) fallback chống câu trả lời rỗng khi Gemini kết thúc function-calling không sinh text; (5) `theo kho`/`contribution` route đúng bi-analyst.
- **data-explorer**: catalog Supabase 0 drift; hướng dẫn "đếm theo nhóm" (querySupabase KHÔNG có GROUP BY → countOnly từng nhóm); routing "liệt kê wiki" / "đếm item" → data-explorer.
- **giai-dap**: thêm glossary chỉ số kinh doanh (Revenue/GP/GPM/CM1/CM1%/3HK Contribution).
- **tu-van**: nêu tên nước lạ (ngoài danh mục, vd Monaco) → báo "chưa có" thay vì hỏi lại; extractParams tự bắt loại SIM (sim vật lý/eSIM). **Multi-country**: "gói dùng được ở CẢ Malaysia VÀ Singapore" → `searchSkusMultiCountry` giao tập nhóm nước phủ ĐỒNG THỜI mọi nước (extractParams gom `countries[]` khi có "cả…và / đồng thời / cùng lúc"; tránh nhầm "so sánh Nhật và Hàn"). GoHub CÓ ~21 nhóm phủ cả Malaysia+Singapore (AP2/APA…).
- **Router**: `GAP_KEYWORD` thêm word-boundary (tránh `3hk co` khớp "3hk **co**ntribution"); chặn BI override cướp câu NCC/gap.

### Grade cuối (2026-07-18): 7/7 con đạt full — bi-analyst 13/13 · data-explorer 8/9(1 niche) · tu-van 7/7 · giai-dap 6/6 · tra-cuu 5/5 · gap-analysis 5/5 · tao-template 3/3.

---

## Cập nhật s110–s111 (2026-07-20)

### Guardian: chỉ CHẶN CỨNG code/hệ thống (mọi role)
- `guardCheck` đảo cấu trúc: phân loại TRƯỚC → nếu `system_internal` (code / build / prompt / schema / credential / kỹ thuật) → **deny cho MỌI vai trò, KỂ CẢ admin·creator** (muốn xem thì đọc repo, bot không tiết lộ nội bộ). Đây là giới hạn DUY NHẤT không phân quyền được.
- Mọi category DỮ LIỆU khác (margin_cogs / staff_hr / customer_pii / revenue_bi / product…): admin·creator full quyền; role khác theo `app_settings.access_policy` → Hiếu tự phân quyền. `DEFAULT_POLICY.system_internal` set toàn `deny` (chỉ để hiển thị — bị chặn cứng trước khi đọc policy). *(⚠️ Đã thay đổi ở s190+1 — xem mục "8 category" phía trên: `access_policy` bị xoá hẳn, mọi category dữ liệu giờ LUÔN allow cho mọi role, không còn phân quyền theo cấu hình DB nữa. Đoạn này giữ nguyên làm lịch sử.)*
- **Fix collision bỏ dấu**: "lương" (salary) ≡ "lượng" (quantity) = `luong` → bỏ bare `\bluong\b` trong `RE_HR`, chỉ nhận lương trong ngữ cảnh lương bổng. Trước đây "số **lượng** sản phẩm bán ra" bị chặn nhầm là nhân sự. Thêm "bán ra / số lượng bán" → `revenue_bi`; siết `ha tang` để không chặn nhầm "hạ tầng mạng".

### giai-dap biết ĐỐI TÁC CHIẾN LƯỢC (partner tiers)
- Câu hỏi "partner strategic gồm ai / X có phải strategic không" trước route về `giai-dap` (không có data) → "không có thông tin". Nay `buildToolContext` inject block **partner tiers** (từ `app_settings.partner_tiers` qua `getPartnerTiers()`) cho giai-dap, gated theo keyword (partner/strategic/tier/đối tác) để tránh token bloat. bi-analyst vốn đã có list này. → cả 2 agent trả lời được "Strategic = Momo, Klook, Traveloka, …".

### Phân quyền TAB dùng ROLE TƯƠI (không JWT stale)
- Bug: admin vừa được cấp quyền cho 1 tài khoản, nhưng tài khoản đó chưa re-login → JWT còn role CŨ. Sidebar hiển thị tab theo `dbRole` (fresh từ `/api/user/me`) nên THẤY tab, nhưng các trang admin-only (`admin`, `analytics/settings|users|sql|schema`) guard bằng `session.user.role` (JWT cũ) → click là đẩy về `/chatbot`.
- Fix: hook `lib/use-role-guard.ts` (`useRoleGuard(allowed)`) fetch `/api/user/me` lấy role TƯƠI, dùng cho cả 5 trang → khớp sidebar, admin mới vào được ngay không cần logout/login. Tab dữ liệu (bod/channels…) vốn đã ổn vì `analytics/layout.tsx` (server) đã re-read DB theo username.

### Test coverage TOÀN BẢNG + fix routing data-explorer (s111)
- `agent-banks.ts` mở rộng phủ **mọi bảng 2 DB**: 13 bảng gohub_dw + 41 bảng Supabase (mỗi bảng ≥1 case) + nhóm **combo** (JOIN đa bảng cùng DB + cross-DB gohub_dw×Supabase) + nhóm **guardian** (ma trận role: system_internal chặn cả admin; margin_cogs/staff_hr chặn staff; "số lượng"≠nhân sự; dữ liệu thường cho staff).
- **Fix routing lớn**: câu "đếm/liệt kê/có bao nhiêu/cấu hình \<bảng\>" TRƯỚC rơi về giai-dap/tra-cuu/tu-van rồi bị các agent đó từ chối "thông tin nội bộ" (KHÔNG phải guardian chặn — đó là prompt agent tự từ chối). Mở rộng mạnh `RE.dataExplore` (nhiều noun catalog/config/KB/internal) + thêm `RE.dataTable` nhận diện TÊN BẢNG tường minh → route đúng data-explorer. Mở rộng `RE.usage` (bắt "lượng data tiêu thụ"). Yêu cầu mã SKU có ≥1 chữ số (tránh "notifications" 13 ký tự thành mã).
- Prompt data-explorer: cấm "punt" (hứa truy vấn rồi dừng) + hint JSON cột chi phí `analytics_channel_costs`. giai-dap: "trong hệ thống" + thuật ngữ nghiệp vụ (KYC…) → vẫn trả lời (không coi là nội bộ).
- **Kết quả grade cuối (s111): 98/98** — bi 21/21 · data-explorer 36/36 · tu-van 7/7 · tra-cuu 5/5 · giai-dap 8/8 · gap 5/5 · tao-template 3/3 · combo 5/5 · guardian 8/8. Unit 64/64 · routing E2E 37/37 · tsc · build PASS. Chạy: `GRADE_AGENT="all" npx vitest run --config vitest.audit.config.ts src/__e2e__/agent-grade.test.ts --disableConsoleIntercept`.
