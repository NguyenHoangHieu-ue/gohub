# Gấu Pro → trợ lý agent hoàn chỉnh (FILE TẠM — làm xong/bỏ plan thì XOÁ file + dòng trỏ trong CLAUDE.md)

Viết 2026-10-05 (s223). Đầu vào: đọc toàn bộ `lib/agents/creator-ai.ts`, `lib/agents/creator/**`, `lib/assistant-memory.ts`,
`api/creator-ai/chat`, `api/lark/events` (nhánh DM creator), wiki `analytics-creator-ai.md` (s131→s207), roadmap audit s196+5
(đã làm A–E: audit log, cost dashboard, digest sáng, tự phát hiện học liệu, eval harness, second-opinion, TTS).
Plan này là vòng TIẾP THEO, không lặp lại những gì đã có.

Ghi chú tên gọi: "Project Astra" là của Google DeepMind (trợ lý đa phương thức: nhìn, nghe, nhớ, hành động); phía OpenAI là
"ChatGPT agent" (agent mode) + Memory + Scheduled Tasks. Plan tham khảo cả hai, cộng Gemini Agent và các nguyên tắc thiết kế agent
của Anthropic.

---

## 1. Hiện trạng Gấu Pro (tóm tắt)

- 1 vòng lặp function-calling (Gemini `gemini-3.8-flash`, `thinkingLevel: low`), tối đa 20 vòng, tool chạy song song mỗi vòng,
  stream text qua SSE. Chạy ĐỒNG BỘ trong 1 request HTTP (`maxDuration = 300`).
- ~36 tool khai báo cùng lúc mọi lượt (SQL gohub_dw, Supabase, GA4/GSC, web search, browseWeb, Bridge đọc/điều khiển Chrome,
  localFiles, Google Drive/Docs/Sheets, Lark Task/Base/Docs/gửi tin, portal NCC, ảnh/video, KB, memory, so báo giá, win-rate,
  verifyReportNumbers).
- System prompt ~570 dòng nạp toàn bộ mỗi lượt (persona, schema DW, quy tắc SQL, chart, export, onboarding SP 5 sheet, kịch bản
  TikTok, preset ảnh, portal...). + KB creator (≤8.000 ký tự, chỉ lượt đầu) + trí nhớ (≤4.000 ký tự, mỗi lượt, chỉ creator).
- Kênh: web `/analytics/creator/ai` (có file, chart, export, TTS, STT trình duyệt) + Lark DM (chỉ creator, không stream).
- Chủ động: cron digest 09:45, cron quét báo giá 10:15, nhắc deadline task Lark (ké `scheduled-messages`, thực tế mỗi giờ).
- An toàn: `system_internal` chặn non-creator; bảng nhạy cảm chặn non-creator; tool ghi có audit log (`gp_action_log`);
  xác nhận trước khi ghi KB chỉ nằm trong PROMPT; `controlMyBrowser` chạy NGAY (Auto từ s195+2).
- Đo lường: `app_usage_events` (cost; từ s223 có `tools_used`/`used_db_tool`), eval harness LLM-judge 10 case (chạy tay).

## 2. Đối chiếu với trợ lý agent hàng đầu

| Năng lực | Hình mẫu | Gấu Pro hiện tại |
|---|---|---|
| Hành động có xin phép | ChatGPT agent luôn hỏi trước hành động "hệ trọng", cho dừng/chen ngang/tự làm tiếp; "watch mode" ở ngữ cảnh nhạy cảm | Chỉ hỏi qua lời dặn trong prompt; điều khiển browser chạy luôn; gửi Lark/ghi Google/ghi file không có cổng duyệt trong code |
| Kế hoạch + báo tiến độ | ChatGPT agent báo tiến độ, người dùng xem/ngắt được; Gemini Agent làm việc nhiều bước | Chỉ dòng trạng thái "Đang xử lý..." từng tool; không có kế hoạch hiển thị, không ngắt giữa chừng |
| Việc dài chạy nền | Agent chạy trên máy ảo riêng, xong thì báo | Gói trong 1 request ≤300s; Lark DM xử lý đồng bộ; đóng tab = mất việc |
| Trí nhớ | ChatGPT: "saved memories" + tự tham chiếu lịch sử chat (tới 1 năm, có link nguồn) | Danh sách phẳng ≤4.000 ký tự, chỉ lưu khi model tự gọi tool, không tìm lại được hội thoại cũ, chỉ creator |
| Việc theo lịch do người dùng đặt | ChatGPT Scheduled Tasks; Gemini Scheduled Actions (tối đa 10 việc) | Chỉ 2 cron cố định do dev viết; người dùng không tự đặt được |
| Đa phương thức thời gian thực | Project Astra: nhìn qua camera/màn hình, nói chuyện tự nhiên, nhớ trong phiên, thao tác thiết bị; Gemini Live API (audio 2 chiều, video/màn hình, function calling, resume phiên) | STT/TTS của trình duyệt, 1 chiều mỗi bên; không có video/màn hình trực tiếp |
| Ngữ cảnh gọn | Agent Skills (Anthropic, chuẩn mở): chỉ nạp mô tả ngắn, cần mới nạp hướng dẫn đầy đủ | Nạp nguyên 570 dòng + 36 tool mọi lượt |

## 3. Nhược điểm cụ thể (có bằng chứng trong code)

**N1 — Rủi ro prompt injection kiểu "bộ ba chết người" (nghiêm trọng nhất).** Cùng 1 lượt Gấu Pro có đủ 3 thứ: dữ liệu riêng tư
(SQL doanh thu, Supabase, Drive, Lark Docs, file máy), nội dung không tin cậy (`browseWeb`, `readMyBrowser`, `browsePortal`,
file tải lên, tài liệu Lark/Google do người khác viết), và kênh gửi ra ngoài (`sendLarkMessage` tới chat_id bất kỳ,
`browseWeb` tới URL bất kỳ, `controlMyBrowser`, `googleWorkspace`/`larkDocs` ghi, `generateImage` gửi prompt sang dịch vụ ngoài).
Một trang web cài sẵn chỉ thị có thể khiến model đọc doanh thu rồi gửi đi. Hiện chỉ có lời dặn trong prompt — không đủ.
Thêm: `sendLarkMessage` KHÔNG nằm trong `CREATOR_ONLY_TOOLS` → user được cấp quyền (không phải creator) cũng khiến bot đăng
vào group Lark bất kỳ bằng chat_id (`lark-send.ts` không kiểm danh sách group).

**N2 — Không có cổng duyệt trong code cho hành động có tác dụng phụ.** Audit log ghi SAU khi làm. `controlMyBrowser` Auto.
Quy trình "đề xuất → chờ xác nhận" của `writeKnowledgeBase` phụ thuộc model nhớ luật.

**N3 — Ngữ cảnh phình, chọn tool kém chính xác.** 570 dòng prompt + 36 tool mỗi lượt: tốn token (mỗi vòng trong 20 vòng lại gửi
lại), tăng độ trễ chữ đầu, model dễ gọi nhầm tool (đã gặp s206+5: lỗi quyền Lark → đi đọc browser/Supabase vô cớ).

**N4 — Việc dài bị giới hạn 1 request.** Onboarding sản phẩm, so báo giá nhiều portal, báo cáo lớn có thể vượt 300s hoặc 20
vòng; không có kế hoạch hiển thị, không ngắt/tiếp tục, không chạy nền rồi báo.

**N5 — Trí nhớ nông.** Không tự rút trí nhớ sau hội thoại; không tìm lại hội thoại cũ ("tuần trước mình bàn gì về JoyTel?");
không có trang xem/sửa trí nhớ; người dùng được cấp quyền (không phải creator) không có trí nhớ; KB nạp 1 lần, cắt 8.000 ký tự.

**N6 — Chủ động hạn chế.** Không cho người dùng tự đặt việc theo lịch/nhắc lặp; không có trigger theo sự kiện (doanh thu tụt,
giá NCC đổi, ETL lỗi); cron thực tế chỉ mỗi giờ và đang trỏ staging.

**N7 — Danh tính và kênh không đồng nhất.** Prompt nói "dành riêng cho Hiếu" nhưng user được cấp quyền cũng dùng (persona +
mục tiêu Q3 của Hiếu áp cho người khác). `agent_id` web = `gau_pro`, Lark DM = `gau-pro`. Lark DM không stream, không file,
lịch sử tách khỏi web.

**N8 — Nền tảng kỹ thuật cũ.** SDK `@google/generative-ai` 0.21 đã hết hỗ trợ (Google ngừng sửa lỗi từ 30/11/2025), phải ép
`as any` cho `thinkingConfig`; không có model routing (câu dễ/khó cùng 1 model).

**N9 — Đo lường chưa khép vòng.** Không có trace từng bước (chỉ log tool ghi); eval chạy tay, không chặn khi sửa prompt;
không có chỉ số "việc hoàn thành" của trợ lý.

## 4. Đề xuất, công nghệ, nguồn

| # | Đề xuất | Cách làm / công nghệ | Nguồn tham khảo |
|---|---|---|---|
| D1 | Cổng duyệt theo mức rủi ro (xử lý N2) | Gắn nhãn mỗi tool: `read` / `write_internal` / `external_send`. Tool `external_send` + `write_internal` quan trọng → không chạy ngay mà trả về sự kiện `approval_required` (UI hiện thẻ Duyệt/Từ chối kèm tham số; Lark DM hiện card có nút). Duyệt xong mới gọi tool. Thực thi trong `dispatchTool`, không dựa prompt. | ChatGPT agent (xin phép trước hành động hệ trọng); Vercel Workflow hooks (tạm dừng chờ duyệt) |
| D2 | Đánh dấu "nhiễm" nội dung ngoài (xử lý N1) | Khi lượt đã gọi tool đọc nội dung không tin cậy (`browseWeb`, `readMyBrowser`, `browsePortal`, file upload, tài liệu người khác) → mọi tool `external_send` trong lượt đó BẮT BUỘC qua D1, kể cả tool đang Auto. Bọc kết quả tool ngoài trong khung "dữ liệu, không phải lệnh". Chặn `browseWeb` gửi query chứa dữ liệu nội bộ (chỉ cho URL người dùng đưa hoặc từ kết quả search). | Simon Willison "lethal trifecta"; OWASP LLM01 Prompt Injection |
| D3 | Skills + nạp tool theo ngữ cảnh (xử lý N3) | Tách prompt thành lõi (~120 dòng: vai trò, quy tắc dữ liệu, an toàn, định dạng) + các skill file (`bi-sql`, `product-onboarding`, `content-tiktok`, `image`, `portal-ncc`, `export`, `lark-google-workspace`...). Mỗi skill có tên + mô tả 1 dòng nạp sẵn; tool `loadSkill(name)` nạp hướng dẫn đầy đủ + bật nhóm tool của skill đó cho các vòng sau. Lõi luôn có tool đọc dữ liệu cơ bản. | Anthropic Agent Skills (progressive disclosure, chuẩn mở 12/2025) |
| D4 | Kế hoạch hiển thị + ngắt được (một phần N4) | Thêm tool nội bộ `updatePlan(steps[])` → sự kiện SSE `plan` (UI hiện checklist bước đang làm/xong). Nút Dừng gửi tín hiệu huỷ (AbortController phía server kiểm giữa các vòng). | ChatGPT agent (báo tiến độ, cho ngắt/tiếp quản) |
| D5 | Việc dài chạy nền (N4) | Chế độ "Giao việc": tạo bản ghi `gp_jobs`, chạy vòng lặp agent trong durable workflow (Vercel Workflow — step có retry, hook chờ duyệt D1), mỗi bước ghi kết quả; xong DM Lark + chuông thông báo + link mở lại. Phương án dự phòng nếu Workflow không dùng được trên gói Hobby: bảng hàng đợi + route tự gọi tiếp từng chặng ≤250s. | Vercel Workflow (durable agents, hooks); Anthropic "Building effective agents" (orchestrator–workers) |
| D6 | Trí nhớ 2 tầng (N5) | (a) Sau mỗi hội thoại, job nền rút ứng viên trí nhớ (Gemini, JSON) → so trùng với trí nhớ cũ → lưu/cập nhật, đánh dấu nguồn hội thoại. (b) Tóm tắt mỗi hội thoại + embedding (pgvector, đã có hạ tầng `kb_chunks` 3072d) → tool `searchPastConversations` trả đoạn tóm tắt kèm link. (c) Trang "Trí nhớ của Gấu" xem/ghim/sửa/xoá. (d) Mở trí nhớ cho user được cấp quyền (đã tách theo username). | ChatGPT Memory (saved memories + reference chat history, có link nguồn) |
| D7 | Việc theo lịch do người dùng đặt (N6) | Tool `scheduleTask(prompt, rrule, kênh)` + bảng `gp_scheduled_tasks` (tối đa N việc/người). Runner ké cron-job.org (đã gọi mỗi giờ) → chạy `runCreatorAI` với prompt ĐẦY ĐỦ đã lưu (không dựa trí nhớ), gửi kết quả qua Lark DM. Hành động `external_send` trong việc theo lịch vẫn qua D1 (gửi thẻ duyệt). | ChatGPT Scheduled Tasks (nhét đủ dữ kiện vào prompt việc); Gemini Scheduled Actions |
| D8 | Trigger theo sự kiện (N6) | Bộ quy tắc đơn giản chạy sau ETL/cron sẵn có: doanh thu ngày lệch > X% so trung bình 7 ngày, giá NCC đổi khi import, sync lỗi → Gấu Pro viết 3 dòng giải thích + DM. Logic phát hiện viết bằng CODE (workflow), AI chỉ diễn giải. | Anthropic: dùng workflow khi bước đã biết trước |
| D9 | Thống nhất danh tính/kênh (N7) | Prompt theo người dùng: phần "về Hiếu + mục tiêu Q3" chỉ nạp khi là creator; user khác dùng hồ sơ từ trí nhớ của họ. Gộp `agent_id` về `gau_pro` (sửa Lark DM + dữ liệu cũ). Lark DM lưu cùng bảng hội thoại với web. | — |
| D10 | Nâng nền tảng model (N8) | Chuyển `@google/genai` (SDK mới; hỗ trợ thinking config, Live API). Routing: câu ngắn/không tool → model nhẹ hoặc `thinkingLevel: minimal`; báo cáo/agent dài → mức suy nghĩ cao hơn. Đặt ở `lib/ai-models.ts`. | Google GenAI SDK migration guide |
| D11 | Trace + eval chặn hồi quy (N9) | Bảng `gp_traces` (mỗi vòng: tool, tham số rút gọn, thời gian, lỗi, token). Trang xem 1 lượt chạy theo dòng thời gian. Mở rộng bank eval (thêm case injection, case duyệt, case skill) và chạy bắt buộc trước khi merge thay đổi prompt/tool. | Anthropic eval practice; OpenAI Agents SDK tracing (khái niệm) |
| D12 | Thử nghiệm kiểu Astra (giai đoạn cuối) | Gemini Live API: hội thoại giọng nói 2 chiều + chia sẻ màn hình/camera, function calling gọi lại đúng bộ tool đọc dữ liệu (không mở tool ghi trong phiên live lúc đầu), token tạm thời phát từ server. Use case: "nhìn bảng giá trên màn hình rồi so với COGS". | Project Astra; Gemini Live API docs |

## 5. Lộ trình thực hiện

Thứ tự theo rủi ro trước, giá trị sau. Mỗi giai đoạn là 1–3 session, staging trước, không tự merge `main`.

**G0 — An toàn (làm trước tiên)**: D1 + D2 + phần prompt theo người dùng của D9.
- Bảng phân loại tool (1 file `tool-policy.ts`), cổng duyệt trong `dispatchTool`, sự kiện SSE `approval_required`, endpoint
  `POST /api/creator-ai/approve`, thẻ duyệt trên web, card duyệt Lark DM.
- `controlMyBrowser`: giữ Auto cho thao tác đọc/cuộn; click/fill/navigate qua cổng duyệt khi lượt đã "nhiễm".
- Test: unit test bảng policy + test "nhiễm" (giả lập kết quả browseWeb chứa lệnh gửi Lark → phải bị chặn chờ duyệt).
- Xong khi: không tool `external_send` nào chạy được mà không có bản ghi duyệt trong lượt có nội dung ngoài.

**G1 — Ngữ cảnh gọn + nền tảng**: D3 + D10.
- Đo trước: token vào/lượt, độ trễ chữ đầu (từ `app_usage_events` + trace tạm).
- Tách prompt thành lõi + skill; `loadSkill`; nhóm tool theo skill. Chuyển SDK `@google/genai` cho Gấu Pro trước (Bé Gấu sau).
- Chạy eval bank cũ + mới, so điểm trước/sau. Xong khi: điểm eval không giảm, token vào/lượt giảm ≥40%.

**G2 — Kế hoạch + việc nền**: D4 + D5 + D11 (trace).
- `updatePlan` + checklist UI + nút Dừng. Kiểm Vercel Workflow trên gói hiện tại; chọn Workflow hoặc hàng đợi tự gọi tiếp.
- Chế độ "Giao việc" + `gp_jobs` + thông báo khi xong. Trace từng bước.
- Xong khi: 1 việc onboarding SP 42 combo chạy nền hết, có duyệt giữa chừng, báo Lark khi xong.

**G3 — Trí nhớ**: D6.
- Job rút trí nhớ sau hội thoại, tóm tắt + embedding hội thoại, tool `searchPastConversations`, trang quản lý trí nhớ, mở cho
  user được cấp quyền.
- Xong khi: hỏi "tuần trước mình kết luận gì về X" trả đúng kèm link; trí nhớ tự rút có độ đúng ≥80% khi Hiếu soát 20 mục.

**G4 — Chủ động**: D7 + D8.
- `scheduleTask` + runner + giới hạn/việc; 3 trigger sự kiện đầu tiên. Cần chốt tần suất cron (hiện mỗi giờ).
- Xong khi: Hiếu tự đặt "8h thứ 2 gửi tóm tắt doanh thu tuần" bằng 1 câu chat và nhận đúng 2 tuần liên tiếp.

**G5 — Đa phương thức (thử nghiệm)**: D12. Chỉ làm khi G0–G3 ổn định; bắt đầu bằng bản chỉ đọc dữ liệu.

## 6. Quy trình cho mỗi hạng mục

1. Đọc wiki `analytics-creator-ai.md` + file liên quan; ghi thiết kế ngắn vào wiki trước khi code nếu đổi kiến trúc.
2. Thêm/sửa case trong eval bank (`__e2e__/gau-pro-banks.ts`) mô tả hành vi mong muốn TRƯỚC khi sửa (thất bại trước, đúng sau).
3. Code trên `staging`; `npx.cmd tsc --noEmit`, `next lint`, `next build`, vitest; chạy eval harness có credentials.
4. QA sống trên staging (web + Lark DM) theo kịch bản trong mục "Xong khi" của giai đoạn.
5. Cập nhật wiki §s2xx + `session_summary.txt`; commit + push từng hạng mục; merge `main` chỉ khi Hiếu yêu cầu.
6. Theo dõi 1 tuần: cost/lượt, độ trễ, tỉ lệ duyệt/từ chối, lỗi tool (trace) → điều chỉnh.

## 7. Chỉ số theo dõi

- An toàn: số hành động gửi ra ngoài không qua duyệt khi lượt đã "nhiễm" = 0.
- Chất lượng: điểm eval bank (mục tiêu không giảm qua mọi thay đổi); tỉ lệ câu trả lời số liệu bị verifyReportNumbers bắt lỗi.
- Hiệu năng: độ trễ chữ đầu p50/p90; token vào trung bình/lượt; cost/lượt (`app_usage_events.est_cost_usd`).
- Hữu ích: số việc nền hoàn thành/tuần; số việc theo lịch đang chạy; tỉ lệ trí nhớ tự rút được giữ lại.

## 8. Quyết định của Hiếu (2026-10-05)

1. Mức duyệt: tôi tự đề xuất, tiêu chí an toàn + tiện → đã chốt và làm ở G0 (xem wiki `analytics-creator-ai.md` §s223 G0).
2. KHÔNG lên Vercel Pro → D5 dùng phương án hàng đợi tự chế (bảng + route tự gọi tiếp từng chặng), không phụ thuộc Workflow; cron
   vẫn qua cron-job.org.
3. Trí nhớ + việc theo lịch: làm KHUNG đa người dùng (theo username), hiện chỉ BẬT cho creator (1 cờ cấu hình để mở sau).
4. Làm lần lượt G0 → G1 → G2 → G3 → G4 → G5.

Tiến độ (2026-10-05): G0 xong (cần chạy migration v64) · G1 xong (skills −53% ngữ cảnh; SDK `@google/genai`) · G2 xong (kế hoạch +
nút Dừng; trace `gp_runs`; việc nền `gp_jobs` theo chặng; panel Việc & duyệt — cần chạy migration v65). Chưa QA sống trên staging phần cần
migration. Tiếp: G3 trí nhớ.

## 8b. Câu hỏi ban đầu (đã trả lời ở trên)

1. Mức độ duyệt: mọi `external_send` đều hỏi, hay chỉ khi lượt đã đọc nội dung ngoài (đề xuất: hỏi luôn với gửi Lark tới người
   khác + ghi Google/Lark Docs; chỉ hỏi khi "nhiễm" với browser)?
2. Gói Vercel: có lên Pro không (ảnh hưởng chọn Workflow vs hàng đợi tự chế, tần suất cron)? Liên quan plan `saas-be-gau.md`.
3. Mở trí nhớ + việc theo lịch cho user được cấp quyền Gấu Pro, hay chỉ creator?
4. Thứ tự ưu tiên G2 (việc nền) vs G3 (trí nhớ) sau khi xong G0–G1.

## 9. Nguồn

- Google DeepMind — Project Astra: https://deepmind.google/technologies/gemini/project-astra/
- Tom's Guide — Project Astra tổng quan: https://tomsguide.com/ai/what-is-project-astra-what-you-need-to-know-about-google-deepminds-ai-initiative
- ChatGPT agent mode (xin phép, watch mode): https://www.kommunicate.io/blog/chatgpt-agent-mode/ · https://sdtimes.com/ai/chatgpt-now-has-an-agent-mode/
- ChatGPT Memory tham chiếu lịch sử chat: https://alternativeto.net/news/2025/4/chatgpt-s-memory-can-now-reference-all-your-past-chats-for-more-personalized-interactions
- ChatGPT Scheduled Tasks dùng memory/ngữ cảnh: https://blog.laozhang.ai/en/posts/chatgpt-scheduled-tasks-context-memory-tools.md
- Gemini Scheduled Actions: https://www.techradar.com/computing/artificial-intelligence/geminis-new-scheduled-actions-feature-puts-catching-up-with-chatgpt-on-its-dayplanner
- Gemini Agent: https://support.google.com/gemini/answer/16596215
- Gemini Live API: https://ai.google.dev/gemini-api/docs/live-api/get-started-sdk
- Anthropic — Agent Skills: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Anthropic — Building effective agents (tóm tắt): https://simonwillison.net/2024/Dec/20/building-effective-agents
- Simon Willison — The lethal trifecta: https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
- SDK cũ hết hỗ trợ: https://github.com/google-gemini/deprecated-generative-ai-js
- Vercel Workflow: https://vercel.com/docs/workflow
