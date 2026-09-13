# Tab: Tổ Gấu (Group Chat + Tài liệu)

**Route:** `/analytics/to-gau`  
**Room:** `/analytics/to-gau/[id]`  
**Phase:** 5 — gộp Note + Knowledge Base vào Tổ Gấu, phân quyền tài liệu theo group  
**Added:** s142 · s142 Phase 4 · **s163 (2026-08-26): gộp Note/KB, xem §"Tab Tài liệu" bên dưới**

---

## ⚠️ s196+4 (2026-09-13) — Gấu Tổ giờ có self-learning như Bé Gấu

Hiếu hỏi Gấu Tổ có tự học/cập nhật thông tin như Bé Gấu/Gấu Pro không — trả lời: KHÔNG, chỉ Bé Gấu có
pipeline này (`detectAndLogLearning()` — 1-shot Gemini phân loại NEW/CONFLICT/CONFIRM khi user thường nói
1 câu chứa thông tin thực tế, log `chatbot_learning_log`, DM Hiếu qua Lark, duyệt qua Gấu Pro "review
pending learning"). Hiếu yêu cầu thêm cho Gấu Tổ luôn.

Tách `detectAndLogLearning()` từ `be-gau.ts` sang module dùng chung mới `lib/agents/learning.ts` (tránh
chép lại y hệt logic — đúng bài học audit s195+17 từng bắt "duplicate code" ở chỗ khác), thêm tham số
`sourceLabel` (mặc định `"Bé Gấu"`, Gấu Tổ truyền `"Tổ Gấu (<tên nhóm>)"` để Hiếu biết ngay nguồn khi
nhận DM Lark). `ai/route.ts` gọi hàm này SAU khi trả lời AI xong, `sessionId: "togau:<groupId>"` (dùng để
lọc/nhận diện nguồn khi query trực tiếp `chatbot_learning_log`, không cần schema mới). Cùng logic gate y
hệt Bé Gấu: bỏ qua nếu người hỏi là `creator`, câu quá ngắn (<30 ký tự), là câu hỏi (kết thúc `?`), hoặc
đang trong cooldown 5 phút/user (**dùng CHUNG rate-limit map với Bé Gấu** — 1 user spam cả 2 nơi vẫn chỉ
tính 1 lần/5 phút, không nhân đôi DM). Approve vẫn ghi vào `creator_kb` GLOBAL (không tách theo group) —
nghĩa là 1 thông tin chia sẻ trong group Tổ Gấu, sau khi Hiếu duyệt, trở thành kiến thức DÙNG CHUNG cho cả
Bé Gấu/Gấu Pro luôn, không chỉ riêng group đó — hợp lý vì mục đích cuối là kiến thức công ty, group chỉ là
nơi phát hiện ra. `runReviewPendingLearning` (Gấu Pro tool) thêm `session_id` vào kết quả trả về để Hiếu
phân biệt được nguồn Bé Gấu/Tổ Gấu khi review.

tsc + lint (0 lỗi mới) + vitest (220/220 — bao gồm bộ test learning detection cũ của Bé Gấu vẫn PASS
nguyên sau khi tách module) PASS. Không cần migration (tái dùng đúng bảng `chatbot_learning_log`+cột
`session_id` có sẵn). **Quyết định scope**: chỉ chạy trên nội dung gửi qua "Hỏi AI" (`ai/route.ts`), KHÔNG
quét mọi tin nhắn chat thường giữa người-với-người (`messages/route.ts`) — đúng phép so sánh với Bé Gấu
(mọi tin nhắn TỚI Bé Gấu = đang "nói chuyện với bot", còn Tổ Gấu là group chat người-với-người, chỉ lúc
bấm "Hỏi AI" mới tương đương). Quét toàn bộ chat thường sẽ tốn Gemini call liên tục 24/7 không cần thiết
và đụng chạm quyền riêng tư hội thoại nội bộ nhiều hơn mức cần. **Cần Hiếu**: nói 1 câu chứa thông tin
thật (không phải câu hỏi, ≥30 ký tự, vd "Vendor X giờ tính phí ship 20k/đơn nhé mọi người") trong 1 group
Tổ Gấu bằng acc KHÔNG phải creator, xác nhận có nhận DM Lark "🔔 Tổ Gấu (<tên nhóm>) phát hiện học liệu...".

---

## ⚠️ s196+3 (2026-09-13) — Fix bug thật hỏi AI kèm ảnh bị "Hiếu đang fix" + badge phân biệt câu hỏi AI

Hiếu báo 2 việc sau khi QA s196+2: (1) đưa ảnh policy vendor + hỏi tóm tắt → luôn báo "Hiếu đang fix,
vui lòng đợi 😔"; (2) cần phân biệt tin nào là hỏi bot với chat thường.

**1. Bug ảnh lỗi — xác nhận qua Vercel Runtime Errors (`get_runtime_errors`), không đoán**:
```
[to-gau/ai] Gemini error: [GoogleGenerativeAI Error]: First content should be with role 'user', got model
```
Root cause: `model.startChat({ history: chatHistory })` — Gemini **bắt buộc turn đầu tiên của history
phải là `user`**, và role phải luân phiên user/model. `chatHistory` build thẳng từ 20 tin nhắn gần nhất
KHÔNG lọc/gộp gì — 2 vấn đề thật trong group chat: (a) tin cũ nhất trong cửa sổ 20 tin có thể tình cờ là
1 câu trả lời AI (role "model") → vi phạm luôn điều kiện (1); (b) nhiều người nói liên tiếp không xen AI
→ nhiều turn "user" liên tiếp, không tự alternate. Bug **có sẵn từ trước** (không phải do tính năng ảnh
mới), nhưng câu hỏi kèm ảnh dễ trúng đúng lúc lịch sử gần nhất rơi vào 1 trong 2 trường hợp này hơn (dùng
để hỏi giữa buổi làm việc, sau khi đã hỏi AI vài câu trước đó → tin cũ nhất trong 20 tin dễ là answer AI).
Fix: build `rawHistory` (role+text thô) → merge các turn LIÊN TIẾP CÙNG role thành 1 (nối bằng `\n`) → cắt
bỏ turn "model" đứng đầu nếu còn sót — đảm bảo luôn thoả cả 2 điều kiện của Gemini.

**2. Badge "🤖 Hỏi AI"** — cột mới `chat_messages.is_ai_question` (migration v56, boolean default false).
`ai/route.ts` set `true` khi insert câu hỏi; FE hiện badge nhỏ phía trên bubble (không đổi màu bubble,
chỉ thêm tag) để phân biệt tin "đã gửi cho AI xử lý" với tin chat người-với-người bình thường.

**Fix kèm phát hiện lúc sửa**: `GET .../messages` (load lần đầu/load more/search/pinned — dùng chung 1
`select()`) thiếu hẳn cột `is_recalled`/`edited_at` — sau F5, tin đã thu hồi/đã sửa mất trạng thái hiển
thị (thu hồi thì content đã bị ghi đè "Tin nhắn đã được thu hồi" ngay từ lúc PATCH nên KHÔNG lộ nội dung
gốc — chỉ mất style italic/dashed; sửa thì mất dòng "(đã chỉnh sửa)" — cả 2 chỉ là cosmetic, không phải
lỗ hổng dữ liệu). Thêm 3 cột `is_recalled, edited_at, is_ai_question` vào cùng 1 `select()` luôn.

tsc + lint (0 lỗi mới) + vitest (220/220) PASS. **Cần Hiếu**: (1) chạy migration v56; (2) QA lại đúng case
đã lỗi — đính kèm ảnh policy vendor, hỏi tóm tắt, xác nhận có trả lời thật; (3) xác nhận tin hỏi AI có
badge "🤖 Hỏi AI" nhỏ phía trên, tin chat thường thì không có.

---

## ⚠️ s196+2 (2026-09-13) — Chat với AI giờ nhận ảnh/file đính kèm (paste + upload), bot "nhìn" được

Hiếu báo: đoạn chat Tổ Gấu không cho gửi ảnh, cũng không paste ảnh vào tin nhắn để bot xem. Đọc code xác
nhận: đính kèm ảnh cho tin nhắn THƯỜNG đã hoạt động từ trước (nút paperclip, `accept="image/*,..."`),
nhưng **2 gap thật**:
1. **Không có paste ảnh (Ctrl+V)** — chỉ đính kèm được qua bấm nút paperclip mở file picker.
2. **"Hỏi AI" hoàn toàn bỏ qua file đính kèm** — nút AI `disabled` khi không có chữ gõ (bất kể có ảnh
   hay không), và `askAI()` chỉ gửi `question` dạng text cho Gemini — dù người dùng có đính kèm ảnh, bot
   không bao giờ nhận được pixel nào để "nhìn".

**Fix**:
- Thêm `addFiles()` dùng chung (paperclip + paste) + listener `window.addEventListener("paste", ...)`
  lọc `image/*` — mirror đúng pattern Bé Gấu đã có (`chatbot/page.tsx`), giới hạn `ATTACH_MAX_FILES=5`
  khớp Bé Gấu.
- `askAI()` giờ cho phép bấm khi CHỈ có file (không cần chữ), upload ảnh/file lên Storage trước (dùng
  chung `uploadFilesToGroup()` tách ra từ `sendMessage()`) rồi gửi `{question, attachments}` cho backend.
- `ai/route.ts`: câu hỏi lưu kèm `attachments` (hiện đúng trong bubble như tin nhắn thường). Với mỗi
  attachment là ảnh (`image/*`) hoặc PDF, server tự `fetch()` lại URL public từ Storage → base64 →
  `inlineData` part cho Gemini (SDK `chat.sendMessage()` nhận `string | Array<Part>`, không cần đổi sang
  `generateContent()`) — bot thật sự "nhìn" được ảnh, không chỉ đọc tên file. Không hỗ trợ multimodal cho
  docx/xlsx/txt lần này (ngoài phạm vi yêu cầu — chỉ ảnh/PDF, đúng nhóm Gemini vision xử lý trực tiếp
  được qua inlineData không cần parse riêng).

tsc + lint (0 lỗi mới) + vitest (220/220) PASS. Chưa test tay qua browser thật (không có Gemini/Supabase
Storage thật trên máy dev). **Cần Hiếu QA staging**: (1) paste 1 ảnh (Ctrl+V) vào ô nhập, gửi tin thường
— ảnh phải hiện trong bubble; (2) đính kèm 1 ảnh (chụp màn hình sản phẩm/hoá đơn...) rồi bấm nút AI (🤖)
KHÔNG gõ chữ gì — bot phải trả lời dựa trên nội dung ảnh thật, không phải đoán mò từ tên file.

---

## ⚠️ s196+1 (2026-09-13) — Fix 5 nhược điểm phát hiện qua audit + 1 bug mới Hiếu báo (câu hỏi AI không hiện)

Tiếp s196. Hiếu duyệt audit, yêu cầu bắt đầu fix + báo thêm 1 bug: hỏi AI Gấu Tổ xong bấm gửi thì KHÔNG
thấy câu hỏi của mình hiện ra trong chat, chỉ có câu trả lời AI xuất hiện đột ngột.

**1. Bug câu hỏi AI không hiện (đúng như Hiếu báo)** — `askAI()`/`ai/route.ts` trước đây dùng nội dung
gõ CHỈ để làm prompt gửi Gemini, KHÔNG BAO GIỜ insert vào `chat_messages` → không ai (kể cả người hỏi)
thấy câu hỏi trong lịch sử, chỉ câu trả lời AI hiện ra không rõ ngữ cảnh (đọc code xác nhận, không đoán —
đúng những gì Hiếu mô tả). Fix: `ai/route.ts` fetch history TRƯỚC, rồi insert câu hỏi thành 1
`chat_messages` THẬT (sender = người hỏi thật) TRƯỚC KHI gọi Gemini (câu hỏi luôn hiện dù Gemini lỗi hay
không) → response đổi shape `{data: {question, answer}}` (trước là `{data: <chỉ answer>}`). Lỗi Gemini
giờ KHÔNG trả 500 câm nữa mà lưu "Hiếu đang fix, vui lòng đợi 😔" làm chính nội dung câu trả lời AI (câu
hỏi vẫn đã lưu) — bỏ hẳn 1 nhánh lỗi riêng ở FE, luôn cùng 1 luồng thành công. FE `askAI()` thêm optimistic
append câu hỏi (giống `sendMessage()`) trước khi gọi API, khớp `tempId` với `question` thật trả về; nếu
lỗi TRƯỚC KHI câu hỏi kịp lưu thì mới khôi phục nội dung vào ô nhập (tránh gửi trùng nếu câu hỏi đã lưu
nhưng answer lỗi). Nhân tiện: chat history gửi Gemini giờ prepend TÊN người nói (`"{tên}: {nội dung}"`) —
trước đó Gemini chỉ có role `user`/`model` trần, không phân biệt được AI ai nói gì trong nhóm nhiều người.

**2. `notifyLarkMembers()` fire-and-forget không `await`** (`messages/route.ts`) — cùng lớp bug đã fix cho
`logChat()`/`app_usage_events` (s195+18-C, Vercel có thể đóng execution context giữa chừng) nhưng chưa áp
dụng ở route này. Đổi sang `await`.

**3. Docs/Notes/Câu hỏi không có Realtime** — mỗi panel chỉ fetch 1 lần lúc mount, member khác thêm/sửa
không tự hiện (đúng bệnh với bug s196 nhưng ở 3 panel này chưa từng làm cả Realtime lẫn poll). Thêm poll
silent 20s/lần (`loadDocs(true)`/`loadNotes(true)`/`load(true)` — tham số `silent` mới, không bật lại
skeleton loading) cho `docs-panel.tsx`/`notes-panel.tsx`/`questions-panel.tsx`. Không dùng Realtime
riêng (tốn thêm channel, ít traffic hơn chat nên poll 20s là đủ).

**4. Không rate-limit `/messages` (POST) và `/ai` (POST)** — thêm `checkRateLimit()` (module dùng chung,
đã dùng ở `/api/chat`): 30 tin/phút/user cho gửi tin (nội bộ nên nới hơn `/api/chat`), 10 câu/phút/user
cho hỏi AI (mỗi câu tốn 1 lần gọi Gemini — chặn spam trước khi chạm cost).

**Chưa làm (để riêng theo yêu cầu Hiếu lúc audit)**: unread badge ở list page — cần thêm cột
`last_read_at` per member, việc lớn hơn, làm sau nếu Hiếu muốn.

tsc + lint (0 lỗi mới) + vitest (220/220) PASS. Chưa test tay qua browser thật (không tái hiện được
Gemini/Supabase thật trên máy dev). **Cần Hiếu QA staging**: (1) hỏi AI Gấu Tổ 1 câu — câu hỏi phải hiện
ngay trong chat trước cả khi có câu trả lời; (2) mở 2 acc, acc A thêm Doc/Note/Câu hỏi mới, acc B (không
chuyển tab) phải thấy trong ≤20s; (3) gửi tin liên tục >30 tin/phút thử xem có bị chặn 429 đúng thông báo
không (không bắt buộc, chỉ cần biết không chặn nhầm lúc dùng bình thường).

---

## ⚠️ s196 (2026-09-13) — Fix bug: tin nhắn người khác không tự hiện, phải F5 mới thấy

Hiếu báo đúng triệu chứng: mình nhắn thì thấy ngay, tin của người khác không tự hiện — phải refresh.
**Root cause nghi vấn cao nhất** (đọc trực tiếp code + migration, không đoán): `sendMessage()` ở
`[id]/page.tsx` append tin nhắn của MÌNH ngay lập tức kiểu optimistic (trước khi server trả về) +ghi đè
lại bằng response REST — không phụ thuộc Realtime chút nào. Tin của NGƯỜI KHÁC hoàn toàn phụ thuộc
`postgres_changes` subscription (Supabase Realtime) — đúng logic, nhưng bảng `chat_messages` **CHƯA
TỪNG được thêm vào publication `supabase_realtime`** (migration v34 tạo bảng, không có bước
`ALTER PUBLICATION ... ADD TABLE`, cũng không thấy log nào cho thấy Hiếu tự bật qua Dashboard →
Database → Replication). Thiếu bước này thì Postgres không phát WAL change ra Realtime server —
**`subscribe()` KHÔNG báo lỗi gì** (channel vẫn báo `SUBSCRIBED` bình thường), chỉ đơn giản không bao
giờ nhận event nào — giải thích đúng vì sao không có exception/console error nào từng lộ ra.

**Fix 2 lớp**:
1. `db/migrations/v55_to_gau_realtime.sql` — `ALTER PUBLICATION supabase_realtime ADD TABLE
   chat_messages;` (idempotent, check `pg_publication_tables` trước). **Cần Hiếu chạy trên Supabase.**
2. **Lưới an toàn ở code** (không phụ thuộc publication/trạng thái kết nối WebSocket đúng hay không):
   thêm `reconcileMessages()` — poll REST `GET .../messages?limit=50` mỗi 12 giây, MERGE (không replace)
   vào state theo `id` nên không mất optimistic message đang gửi dở, không giật scroll khi không có gì
   đổi. Chạy song song `loadPinned()` cùng nhịp (pin cũng chỉ sync qua Realtime UPDATE event, cùng rủi
   ro). Đây là "belt and suspenders" — kể cả nếu sau này Realtime lại âm thầm gãy vì lý do khác (mất kết
   nối WebSocket giữa phiên dài, proxy công ty chặn WS...), tin nhắn vẫn tự đồng bộ trong tối đa 12s thay
   vì kẹt vô thời hạn tới khi user tự F5.

tsc + lint (0 lỗi mới) + vitest (220/220) PASS. Chưa test tay qua browser thật (không tái hiện được
Realtime miss trên máy dev — không có `.env.local`/Supabase project thật). **Cần Hiếu**: (1) chạy
migration v55, (2) QA lại 2 tab/2 acc khác nhau — acc A gửi tin, acc B (không F5) phải thấy tin hiện ra
trong ≤12s (lý tưởng là gần như ngay lập tức nếu publication fix đúng nguyên nhân).

---

## ⚠️ s194+12 (2026-09-06) — UI redesign: hex navy sai `#003B95` (màu chủ đạo toàn tab) → brand

Toàn bộ To-Gau (list page + room page + 6 component con: docs-panel/notes-panel/questions-panel/
settings-modal/wiki-panel/file-preview + `lib/to-gau-format.tsx`) dùng hex `#003B95`/`#002d73` làm màu định
danh xuyên suốt: header, bubble chat "mình", input focus ring, mention highlight (`renderContent`),
blockquote markdown (`renderMarkdown`), mọi nút hành động ở 4 panel Docs/Notes/Câu hỏi/Wiki. Đây chính là 1
trong 7 file bị audit s192 flag có hex sai — sửa toàn bộ sang `brand-600`/`brand-700`. Giữ nguyên role tag
"Manager"=blue trong danh sách thành viên (categorical, phân biệt Admin=amber/Manager=blue). Không đổi
logic/quyền hạn nào. Tự QA qua Chrome bằng acc role `bod` trên staging — chat bubble "mình" hiện navy đúng,
4 panel Docs/Notes/Câu hỏi/Wiki đều đúng màu.

---

## ⚠️ s194+8 (2026-09-06) — Fix bug lớn: MỌI role không phải admin/creator chưa từng vào được Tổ Gấu

Hiếu báo "mở lại Tổ Gấu cho tất cả mọi người vào được — vài acc tôi bấm vào không được". Tái hiện bằng
acc thật role `bod` (username `hieu`) đã được add làm member group thật: bấm sidebar "Tổ Gấu" → hoàn toàn
không phản ứng (URL không đổi).

**Root cause**: `app/(dashboard)/analytics/layout.tsx` là server-side gate áp dụng cho MỌI route con
`/analytics/*`, dùng `granted.has(pathToAnalyticsId(pathname))` để chặn truy cập thẳng URL trang analytics
chưa được cấp quyền (`role_permissions` ∪ `allowed_analytics` per-user). `/analytics/to-gau` cũng khớp
route pattern này → bị coi như 1 "trang analytics" tên `to-gau`. Nhưng Tổ Gấu **không phải** trang
analytics — theo đúng thiết kế (`sidebar.tsx`/`nav.ts`, xem §Access Control dưới), nó hiện cho MỌI role,
chỉ ẩn qua `hiddenTabs` (creator config), hoàn toàn KHÔNG nằm trong `role_permissions`/`allowed_analytics`
của bất kỳ role nào. Kết quả: `granted.has("to-gau")` LUÔN `false` cho mọi role không phải admin/creator
(2 role này bypass gate này từ đầu layout) → `redirect("/chatbot")` ngay lập tức, bất kể user có phải
member group thật hay không. Bug tồn tại từ khi `analytics/layout.tsx` được tách ra làm gate chung, ảnh
hưởng **toàn bộ** user thường (staff/manager/bod/...) — không ai phát hiện vì đội test chủ yếu dùng acc
creator (tự động bypass).

**Fix**: thêm early-return `if (id === "to-gau") return <>{children}</>` ngay trước đoạn check `granted`,
giữ nguyên gate cho mọi trang analytics thật khác. tsc + lint + vitest (185/185) PASS. QA lại bằng chính
acc `hieu` (role bod) qua Chrome trên staging — vào được danh sách Tổ Gấu, vào được group, thấy chat/
members/AI đầy đủ. ✅ **Hiếu đã tự xác nhận trên staging — vào được, OK.**

---

## ⚠️ s194+6 (2026-09-06) — panel "Câu hỏi CS" + AI search thêm Docs/Notes nhóm + trích nguồn

Theo yêu cầu Hiếu: CS hay tag người trong ticket/troubleshoot hỏi về sản phẩm/policy nhưng câu hỏi "trôi mất",
không ai biết đã trả lời/update thông tin chưa. 4 phần:

1. **Panel "❓ Câu hỏi" mới** — sub-tab thứ 3 cạnh Docs/Notes trong track "Của nhóm" (`groupSubTab`).
   Bảng mới `chat_questions` (migration v48) — xem §DB Tables. Bất kỳ member nào trong nhóm đặt câu hỏi,
   trạng thái mặc định `chua`; bất kỳ member nào khác (không riêng người hỏi) đổi trạng thái/trả lời được
   — mang tính cộng tác, ai biết thông tin thì trả lời. Trả lời xong tự chuyển `da_xu_ly`.
2. **AI Gấu Tổ tìm kiếm thêm Docs + Notes của group** (`searchKB()` trong `ai/route.ts`) — trước đây CHỈ tìm
   `kb_wiki_pages` (Wiki toàn hệ thống), nên nội dung lưu vào Docs/Notes của 1 group không có tác dụng gì với
   AI của chính group đó. Nay search cả 3 nguồn song song (`Promise.all`), gộp context theo nhãn
   `[Wiki]` / `[Tài liệu nhóm]` / `[Ghi chú nhóm]`. Không cần pipeline embedding/reindex riêng — search chạy
   trực tiếp (ILIKE) trên bảng sống mỗi lần hỏi, nên lưu Doc/Note mới có hiệu lực ngay lập tức.
3. **Trích dẫn nguồn để kiểm chứng** — system prompt Gấu Tổ thêm rule: dùng thông tin từ tài liệu tham khảo
   thì PHẢI ghi `(Nguồn: [Wiki] Tên trang)` / `(Nguồn: [Tài liệu nhóm] Tên file)` /
   `(Nguồn: [Ghi chú nhóm] người viết)` ở cuối câu trả lời — người hỏi bấm sang tab Docs/Notes/Wiki đọc lại
   nguyên văn để kiểm chứng, không bịa nguồn nếu không có tài liệu nào khớp.
4. Component mới `components/to-gau/questions-panel.tsx`, type `QuestionItem` (`lib/to-gau-types.ts`).

tsc + lint (0 lỗi mới) + vitest (185/185) PASS. **Đã tự QA đầy đủ qua Chrome trên staging thật
(`stg-intel-v2.gohub.cloud`)** — panel Câu hỏi: đặt câu hỏi/đổi trạng thái chưa→đang→đã xử lý/trả lời tự
chuyển đã xử lý đều PASS. Hỏi AI 1 câu có đáp án nằm trong Notes của group → AI trả lời đúng + trích đúng
nguồn `(Nguồn: [Ghi chú nhóm] ...)`.

### ⚠️ s194+7 — bug thật phát hiện lúc QA: `gemini-2.0-flash` bị Google khai tử, Gấu Tổ AI chết 500 âm thầm 6 ngày

Lúc QA mục AI trích nguồn ở trên, hỏi AI trả về 500 rỗng body. Tra Vercel runtime error log
(`get_runtime_errors`) thấy model `gemini-2.0-flash` trả `404 This model ... is no longer available` liên
tục từ **2026-08-31** — Gấu Tổ AI đã chết từ 6 ngày trước, không liên quan gì đến task đang làm, không ai
biết vì route `ai/route.ts` không có try/catch nên lỗi không hiện gì cho user (im lặng fail). Grep repo:
toàn hệ thống đã chuyển sang `gemini-3.6-flash` từ trước, chỉ sót đúng 3 route dùng model cũ —
`to-gau/groups/[id]/ai/route.ts`, `api/analytics/usage-stats/classify`, `api/analytics/usage-stats/evaluate`
— cả 3 đã đổi sang `gemini-3.6-flash`. Thêm try/catch quanh lời gọi Gemini trong `ai/route.ts` (trả "Hiếu
đang fix, vui lòng đợi" thay vì 500 rỗng) để lần sau lỗi API dễ chẩn đoán hơn. tsc + lint + vitest (185/185)
PASS, QA lại qua Chrome + fetch trực tiếp trên staging — AI hoạt động đúng trở lại.

---

## ⚠️ s170 (2026-08-31) — audit bảo mật, fix 4 bug thật

Theo yêu cầu Hiếu "quét tab Tổ Gấu". 4 bug xác nhận qua đọc code trực tiếp:

1. **XSS trong Wiki**: `renderMarkdown()` (`to-gau/[id]/page.tsx`) build HTML bằng regex thay thế trực tiếp,
   KHÔNG escape trước khi bơm vào `dangerouslySetInnerHTML` (view + preview lúc soạn). Fix: thêm `escapeHtml()`
   chạy TRƯỚC mọi regex markdown.
2. **Pin tin nhắn xuyên nhóm**: `messages/[msgId]/pin/route.ts` check quyền theo `group_id` trong URL nhưng
   fetch/update tin nhắn chỉ lọc theo `msgId` → manager nhóm A pin/unpin được tin nhắn nhóm B. Fix: thêm
   `.eq("group_id", id)` vào cả 2 query (giống PATCH route cạnh đó vốn đã đúng).
3. **Filter injection `.or()`**: `user-search/route.ts` nội suy thẳng query `q` vào `.or()` PostgREST không
   escape — `,`/`.`/`(`/`)` phá cú pháp filter. Fix: escape `\`/`"` rồi bọc value trong dấu ngoặc kép
   (cú pháp PostgREST cho phép literal chứa ký tự reserved). *(route `ai/route.ts` cùng pattern nhưng AN TOÀN
   sẵn — `keywords` đã strip chỉ còn `[a-zA-Z0-9À-ỹ ]` trước khi build `.or()`, không cần sửa.)*
4. **Nhóm "Lưu trữ" chỉ khoá ở FE**: `messages/route.ts` POST không check `chat_groups.is_archived` — gọi
   thẳng API vẫn gửi được tin nhắn vào nhóm đã archive. Fix: thêm check, trả 403 nếu archived.
5. (LOW, không phải lỗ hổng) Nút Wiki (soạn/gán nhóm) FE gate bằng `session.user.role` (JWT cũ) trong khi
   backend `kb/wiki/*` dùng `getDbRole()` (tươi) — không nhất quán, gây admin mới cấp quyền không thấy nút
   tới khi re-login. Fix: đổi sang `useDbRole()` (hook có sẵn, cùng pattern `b2c-performance.tsx`).

tsc PASS. Chưa test tay qua browser (máy dev thiếu môi trường auth thật) — Hiếu QA lại pin/archived/wiki-XSS
trên staging trước merge.

---

## ⚠️ s163 — Gộp Note (`/info`) + Knowledge Base (`/kb`) vào Tổ Gấu

Tab **Note** (sidebar, mọi role thấy) và trang **`/kb`** (nhúng bên trong Note, không có entry riêng) đã
**xoá hoàn toàn** — sidebar nay chỉ còn 1 entry nổi bật duy nhất: **Tổ Gấu**, hiển thị cho **mọi role** (trước đây
Tổ Gấu chỉ hiện cho `creator` trong sidebar dù API đã hỗ trợ member thường — đây là bug tồn tại từ trước, đã sửa
cùng đợt này, nếu không fix thì gộp Note/KB vào Tổ Gấu sẽ làm staff mất hẳn đường vào tài liệu).

Bỏ hẳn không port: Overview tra cứu `ref_categories`/`ref_support_countries`, ghi chú cá nhân (`user_notes`),
file tham khảo cá nhân (Storage bucket `Information`) — quyết định của Hiếu, ít người dùng. Bảng `user_notes` +
bucket `Information` **không bị xoá** (không viết migration DROP, tránh mất dữ liệu ai còn cần đọc lại), chỉ
ngừng có UI truy cập.

Pipeline **Upload tài liệu → AI đề xuất Wiki (MRP)** (`kb_documents`/`kb_chunks`/`kb_processing_jobs`, API
`/api/kb/documents`, `/api/kb/process`) **giữ nguyên, dời UI** từ `/kb` sang **Creator Settings**
(`/analytics/creator` → section "Tài liệu chính thức — Upload & AI đề xuất Wiki",
`analytics/creator/kb-docs-section.tsx`) — chỉ admin/creator, API POST đã thêm gate role (trước đây không gate,
chỉ ẩn nút ở FE).

---

## Mô tả

Group chat nội bộ trên GoHub Intel. Mỗi group có thể có thành viên khác nhau. Creator/admin có toàn quyền tạo/xóa/quản lý group; user thường chỉ thấy group mình được thêm vào.

---

## DB Tables (Supabase — migration v34)

### `chat_groups`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| name | text | Tên nhóm |
| description | text | Mô tả (nullable) |
| avatar_emoji | text | Mặc định 🐻 |
| created_by | text | Email người tạo |
| ai_enabled | boolean | Bật/tắt Gấu Tổ AI |
| ai_scope | text | Prompt giới hạn scope AI |
| notify_lark | boolean | Gửi DM Lark khi có tin mới (default true) |
| is_archived | boolean | Soft delete / lưu trữ |
| created_at / updated_at | timestamptz | |

### `chat_group_members`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK → chat_groups | CASCADE |
| user_email | text | ⚠️ **Lưu USERNAME, không phải email thật** — xem §"Fix identity-collision" ngay dưới |
| user_name | text | Lookup từ users table |
| role | text | 'member' \| 'manager' \| 'admin' — manager thêm/xoá được member + ghim tin nhắn, KHÔNG đổi role/xoá group |
| added_by | text | ⚠️ Username người thêm (không phải email) |
| added_at | timestamptz | |
| UNIQUE | (group_id, user_email) | |

### ⚠️ Fix identity-collision (s163, cùng ngày, task riêng sau khi test s163 phát hiện)

**Bug (có từ s142, không phải do gộp Note/KB s163)**: mọi route Tổ Gấu định danh "tôi là ai" bằng
`session.user.email || ""`. Rất nhiều tài khoản (43 user, đa số login qua Lark OAuth, **gồm cả `creator` của
Hiếu**) có `users.email = NULL` → với các user này, `email || ""` luôn ra cùng 1 giá trị `""` — **mọi user
không-email cùng chung 1 "danh tính"**. Hậu quả thật: 1 user không-email được add vào group X → MỌI user
không-email khác mặc nhiên "là member" group X (khớp `user_email=""`), dù chưa từng được mời — thấy được
Docs/Notes/tin nhắn/Wiki riêng-nhóm. Phát hiện khi test s163 (dùng session giả lập trùng email rỗng với data
thật của Hiếu, ban đầu tưởng nhầm là bug tính năng mới, sau mới lộ ra là bug định danh có sẵn).

**Fix**: đổi khoá định danh từ `email` sang **`session.user.username`** (luôn duy nhất + luôn có, kể cả login
qua Lark không gắn email) ở **toàn bộ** route `api/to-gau/**` + `api/kb/wiki/route.ts` (check `isGroupMember`
thêm ở s163). **Giữ nguyên tên cột DB** (`user_email`, `sender_email`, `uploaded_by`, `created_by`, `added_by`)
để tránh viết migration đổi tên — các cột này nay lưu **username, không phải email thật** (đã ghi comment tại
mỗi route). Đã backfill 2 group + 2 member + 8 message (Hiếu) + 1 note hiện có từ `""`/email cá nhân
(`hieunh862@gmail.com`, rò rỉ từ session Lark cũ) sang username thật của Hiếu (`lark_ou_e5af3c7...`).

**Đổi API "Thêm thành viên"** (`POST /api/to-gau/groups/[id]/members`): body đổi từ `{user_email}` sang
`{username, user_name}` — không còn nhận email gõ tay (nhiều user không có email để gõ). FE bắt buộc **chọn từ
gợi ý autocomplete** (`/api/to-gau/user-search`, nay trả thêm `username`, tìm được cả theo tên khi user không
email) thay vì gõ tự do — tránh gõ sai/không resolve được username thật. `PATCH` (đổi role) đổi key
`user_email`→`username`; `DELETE` đổi query param `?email=`→`?username=`.

**Lark DM lookup** (`notifyLarkMembers`): đổi join `users` từ `.eq("email",...)` sang `.eq("username",...)` —
ổn định hơn (trước đây user không-email không nhận được @mention DM dù có `lark_open_id`, vì lookup theo email
rỗng không match ai).

**Test**: verify bằng HTTP thật (session tự ký qua `NEXTAUTH_SECRET`, không đụng password) — 2 user giả không-
email khác nhau, chỉ 1 người được add vào group → xác nhận người còn lại KHÔNG còn thấy group đó (trước đây sẽ
thấy do collision). Toàn bộ luồng add/đổi-role/xoá-member qua username cũng test PASS qua HTTP thật.

### `chat_messages`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK → chat_groups | CASCADE |
| sender_email | text | |
| sender_name | text | |
| content | text | |
| msg_type | text | 'text' / 'image' / 'file' / 'ai' |
| attachments | jsonb | Array `{url, name, size, type}` |
| reply_to | uuid FK → chat_messages | Nullable |
| is_pinned | boolean | Pin bởi creator/admin |
| created_at | timestamptz | |

Index: `idx_chat_messages_group_created ON chat_messages(group_id, created_at DESC)`

**Yêu cầu users table:** cột `lark_open_id text` để gửi Lark DM.

### `chat_questions` (migration v48, s194+6)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| group_id | uuid FK → chat_groups | CASCADE |
| question | text | |
| asked_by / asked_by_name | text | username (không phải email thật, cùng quy ước các bảng khác) |
| status | text | `chua` \| `dang` \| `da_xu_ly`, default `chua` |
| answer / answered_by / answered_by_name | text nullable | Set khi có người trả lời |
| created_at / updated_at | timestamptz | |

Index: `(group_id, created_at DESC)`, `(group_id, status)`.

### Tài liệu Chính thức — mở rộng `kb_wiki_pages` (migration v43, s163)

Track "Chính thức" (creator/admin viết) dùng **chung bảng `kb_wiki_pages`** với trang `/kb` cũ (đã xoá) — KHÔNG
phải bảng riêng cho Tổ Gấu. Thêm 2 thứ, additive, không phá dữ liệu cũ:

| Thay đổi | Ghi chú |
|---|---|
| `kb_wiki_pages.visibility_mode` (TEXT, default `'all'`) | `'all'` = hiện cho MỌI group Tổ Gấu (mặc định, khớp hành vi cũ). `'groups'` = chỉ hiện cho group được gán trong `kb_wiki_page_groups`. |
| `kb_wiki_page_groups` (`page_id`, `group_id` — PK kép) | Bảng nối N-N: 1 trang có thể gán cho nhiều group. `is_hidden` (cột cũ) vẫn giữ nghĩa draft/nháp — chỉ admin/creator thấy; `visibility_mode`/`kb_wiki_page_groups` chỉ áp dụng SAU khi đã publish (`is_hidden=false`). |

Trang tạo TỪ trong 1 group Tổ Gấu → mặc định `visibility_mode='groups'` gán riêng cho group đó (không tự động
"toàn công ty"). Đổi phân phối qua modal "Gán nhóm" (chỉ admin/creator) — gọi `GET/PUT /api/kb/wiki/[id]/groups`.

---

## API Endpoints

| Method | Path | Guard | Mô tả |
|---|---|---|---|
| GET | `/api/to-gau/groups?archived=true` | session | List groups (privileged = all; user = nhóm mình). ?archived=true → lưu trữ |
| POST | `/api/to-gau/groups` | creator/admin | Tạo group mới |
| GET | `/api/to-gau/groups/[id]` | member / creator | Group info + members |
| PATCH | `/api/to-gau/groups/[id]` | creator/admin | Sửa name/desc/emoji/ai_enabled/ai_scope/notify_lark/is_archived |
| DELETE | `/api/to-gau/groups/[id]` | creator/admin | Xóa group (cascade) |
| GET | `/api/to-gau/groups/[id]/members` | member / creator | Danh sách members |
| POST | `/api/to-gau/groups/[id]/members` | creator/admin | Thêm member |
| DELETE | `/api/to-gau/groups/[id]/members?email=xxx` | creator/admin | Xóa member |
| GET | `/api/to-gau/groups/[id]/messages?limit=50&before=<uuid>` | member / creator | Lấy messages (cursor paging, ASC) |
| GET | `/api/to-gau/groups/[id]/messages?search=<query>` | member / creator | Search messages (ilike, DESC newest first) |
| GET | `/api/to-gau/groups/[id]/messages?pinned=true` | member / creator | Chỉ lấy pinned messages |
| POST | `/api/to-gau/groups/[id]/messages` | member / creator | Gửi message (trigger Lark notify fire-and-forget) |
| POST | `/api/to-gau/groups/[id]/messages/[msgId]/pin` | creator/admin | Toggle is_pinned |
| POST | `/api/to-gau/groups/[id]/ai` | member / creator | Hỏi AI Gấu Tổ |
| GET/POST/DELETE | `/api/to-gau/groups/[id]/docs` | member / creator | CRUD tài liệu nhóm |
| GET/POST/PATCH/DELETE | `/api/to-gau/groups/[id]/notes` | member / creator | CRUD ghi chú chung |
| GET/POST/PATCH/DELETE | `/api/to-gau/groups/[id]/questions` | member / creator | CRUD câu hỏi CS (s194+6) — PATCH nhận `{status?, answer?}` |
| POST | `/api/to-gau/upload` | member / creator | Upload file lên Supabase Storage |
| GET | `/api/kb/wiki?groupId=<id>&search=` | member / creator | List trang Chính thức hiện cho group đó (`visibility_mode='all'` hoặc gán riêng group) |
| GET/PATCH/DELETE | `/api/kb/wiki/[id]` | creator/admin (PATCH/DELETE) | Đọc 1 trang (+ lịch sử version) / sửa nội dung / xoá — dùng chung với pipeline MRP (Creator Settings) |
| GET/PUT | `/api/kb/wiki/[id]/groups` | creator/admin | Xem/đổi danh sách group được gán (`visibility_mode` + `group_ids`) |
| POST | `/api/kb/wiki` | creator/admin | Tạo trang mới — có thêm `group_ids`/`visibility_mode` trong body |

> ⚠️ **s163**: route cũ `/api/to-gau/kb` (đọc `kb_wiki_pages` riêng, tự suy "audience" bằng regex parse frontmatter
> trong `content`) đã **xoá hoàn toàn** — thay bằng `/api/kb/wiki*` ở trên (nguồn đọc/ghi Wiki DUY NHẤT trong hệ
> thống, tránh lặp lại lệch logic giữa 2 route như trước). `last_edited_by`/`last_edited_at` nay dùng thẳng cột
> thật `updated_by`/`updated_at` (trước đây parse regex từ YAML frontmatter chèn trong `content` — hack, đã bỏ).

---

## Phase 4 — Features

### 1. Lark Notification
- Sau khi INSERT message thành công → fire-and-forget `notifyLarkMembers()`
- Lấy `notify_lark` flag từ group; nếu false → skip
- Lấy tất cả members (trừ sender) → JOIN `users` → lấy `lark_open_id`
- Text: `[{emoji} {group_name}] {sender_name}: {preview}` (preview = 80 chars hoặc "📎 Đã gửi file")
- Dùng `sendLarkDM` từ `@/lib/lark`

### 2. @mention
- Gõ `@` trong textarea → dropdown max 5 members (filter theo text sau @)
- Click hoặc Enter → replace `@{query}` bằng `@{handle}` (user_name hoặc email prefix, no spaces)
- `renderContent()`: parse `@word` → highlight mình = `bg-yellow-100 text-yellow-800`, người khác = `text-[#003B95]`
- Realtime Supabase cũng subscribe UPDATE event để sync `is_pinned`

### 3. Message Search
- Nút 🔍 trong header → toggle search panel (dưới header)
- Debounce 300ms → GET `?search=<query>` → ilike case-insensitive
- Results: overlay panel, highlight matching text, click → scroll đến message (`id=msg-{id}`) + flash background
- ESC hoặc X để đóng

### 4. Pin Message
- Hover vào message → action button "Ghim" / "Bỏ ghim" (chỉ creator/admin)
- POST `/messages/[msgId]/pin` → toggle `is_pinned`
- Pinned strip ở trên tab bar (chỉ khi có pinned messages trong chat tab): collapsible, hiện content preview
- Pinned bubble có `ring-1 ring-amber-400` + icon 📌 nhỏ dưới timestamp

### 5. Polish
**List page:**
- Filter toggle: [Hoạt động] [Lưu trữ] — GET `?archived=true/false`
- Badge "Lưu trữ" trên card (slate, opacity thấp)
- `fmtRelative()`: mở rộng "hôm qua" + "N ngày trước" (trước chỉ có giờ/phút)

**Chat room:**
- Banner màu amber nếu `is_archived = true` + disable input bar
- Scroll-to-bottom button (ChevronDown float) khi cách bottom > 200px

---

## UI Flow

### List page (`/analytics/to-gau`)
- Toggle [Hoạt động] / [Lưu trữ] trên/dưới header
- Grid 3 cột: card mỗi group (emoji, tên, badge lưu trữ, số member, last message + relative time)
- Creator/admin: nút "Tạo nhóm" → modal (emoji picker + name + description)

### Chat room (`/analytics/to-gau/[id]`)
- Layout 2 cột: main chat + sidebar members (240px, ẩn mobile)
- Header: ArrowLeft + emoji + tên + badge AI + nút Search
- (nếu archived) Banner warning + disable input
- (nếu có pinned) Strip amber collapsible trước tab bar
- Tab bar: **💬 Chat | 📚 Tài liệu**. Tab Tài liệu có sub-tab: **Chính thức** (Wiki, chỉ admin/creator viết,
  gán nhóm) | **Của nhóm** (📄 Docs + 📌 Notes + ❓ Câu hỏi — member trong group tự up/đặt câu hỏi)
- Messages: ASC (cũ → mới), scroll-to-bottom auto, real-time INSERT + UPDATE
- Bubble: mình = `bg-[#003B95] text-white` right; người khác = `bg-white border` left; AI = indigo gradient
- Hover trên bubble → nút Ghim (creator/admin) absolute
- Input bar: paperclip + textarea (@mention dropdown) + AI button + Send

---

## Access Control

- `creator` hoặc `admin` → toàn quyền (tạo group, CRUD, xem all, pin)
- User thường → chỉ thấy/vào group đã được add vào; không pin được
- 401 nếu không có session; 403 nếu không phải member/privileged
- ⚠️ **Route `/analytics/to-gau*` KHÔNG phải trang analytics** dù nằm dưới `/analytics/` — sidebar hiện
  cho MỌI role (chỉ ẩn qua `hiddenTabs` creator config), gate thật nằm ở API routes (member check ở trên)
  chứ KHÔNG phải `role_permissions`/`allowed_analytics`. `app/(dashboard)/analytics/layout.tsx` phải
  bypass sớm cho `id === "to-gau"` (xem s194+8) — nếu ai đó sau này refactor layout này, PHẢI giữ bypass
  này, nếu không mọi role không phải admin/creator sẽ lại bị redirect ngược `/chatbot` im lặng.

## s196+14 (2026-09-13) — Gấu Tổ AI: thinkingLevel + retry

Theo roadmap audit toàn diện Tổ Gấu (s196+5, xem artifact riêng) — 2 phát hiện nghiêm trọng nhất, cả 2
cùng nằm ở `groups/[id]/ai/route.ts`, nay đã fix (P0):

- **thinkingLevel** — Gấu Tổ AI là nơi DUY NHẤT trong 3 agent (Bé Gấu/Gấu Pro/Gấu Tổ) dùng
  `gemini-3.8-flash` mà KHÔNG set `generationConfig.thinkingConfig.thinkingLevel` — mặc định rơi về
  `"medium"` (billable, latency ẩn mỗi câu hỏi, ở MỌI group cùng lúc). Nay set `"low"` giống `be-gau.ts`/
  `creator-ai.ts`.
- **Retry lỗi tạm thời** — trước dùng thẳng `model.startChat().sendMessage()`, KHÔNG retry gì → bất kỳ
  lỗi 429/503/timeout nào rơi thẳng "Hiếu đang fix, vui lòng đợi". Đổi sang `genWithRetryStream()` (dùng
  chung Bé Gấu/Gấu Pro, retry 3× backoff) — gọi KHÔNG truyền `onChunk` nên vẫn trả 1 cục JSON như cũ,
  KHÔNG đổi sang streaming (đề xuất C, để riêng đợt sau). Chuyển từ `startChat/sendMessage` sang build
  `contents` thủ công (history + turn mới) để dùng chung được helper — cùng pattern `be-gau.ts`.

Không đổi `temperature`/logic khác (ngoài phạm vi P0 lần này). tsc + lint (0 lỗi mới) + vitest (230/230)
PASS — không có unit test riêng cho route này (đúng finding #7 trong audit: chưa có eval harness cho Gấu
Tổ AI, để làm sau). **Cần Hiếu QA thủ công**: hỏi AI trong 1 group, xác nhận vẫn trả lời đúng/không chậm
hơn rõ rệt; không cần chạy migration nào.

## s196+15 (2026-09-13) — Guardian nhẹ + cost tracking + tóm tắt on-demand + reply/thread

Tiếp roadmap audit Tổ Gấu s196+5, nhóm P1 (4 việc, đều trong `groups/[id]/ai/route.ts` trừ mục cuối):

- **Guardian nhẹ** (đề xuất #1) — trước hoàn toàn dựa vào prompt tự nhắc "không tiết lộ COGS/margin",
  không có lớp code chặn nào. Tái dùng `guardCheck()` có sẵn (`lib/agents/guardian.ts`), chỉ kiểm
  `system_internal` — mọi category dữ liệu khác vẫn "ai cũng như nhau". KHÔNG dùng `ignoreRole:true` như
  Lark (web session đã xác thực role thật, admin/creator vẫn hỏi được nếu cần). Chặn TRƯỚC khi tốn tiền
  gọi Gemini/tải attachment — bọc toàn bộ phần build prompt + gọi model vào nhánh `guard.allowed`.
- **Cost/token tracking theo group** (đề xuất D) — trước hoàn toàn không observable dù là hoạt động của
  MỌI group cùng lúc. Ghi `app_usage_events` (`agent_id:"to-gau"`, `page_path:"/analytics/to-gau/<id>"` —
  mượn field có sẵn thay vì migration cột `group_id` mới, lọc theo group qua `page_path` khi cần) kèm
  `tokens_in/out/est_cost_usd` (tính từ `usageMetadata`, dùng chung `gemini-pricing.ts`). Ghi cả khi bị
  guardian chặn (tokens=0, cost=0 — đúng vì không gọi Gemini).
- **Tóm tắt thảo luận theo yêu cầu** (ý tưởng #3) — phát hiện câu hỏi chứa "tóm tắt"/"tóm lược"/"summar"
  → nới giới hạn lịch sử từ 20 lên 60 tin + thêm 1 directive prompt đổi khung nhìn "lịch sử chat = nội
  dung chính cần tóm tắt" (không ép trích nguồn Wiki/Docs như chế độ hỏi-đáp thường). Không cần tool/
  route mới, tái dùng nguyên hạ tầng.
- **Reply/thread cho tin nhắn thường** (ý tưởng #5) — cột `reply_to` đã tồn tại (trước chỉ AI dùng khi
  trả lời câu hỏi). `messages/route.ts` POST nhận thêm `replyTo` (rescope theo `group_id` trước khi lưu,
  tránh trỏ sang tin nhắn nhóm khác). FE (`[id]/page.tsx`): nút "Trả lời" trong hàng action hover mỗi tin
  nhắn → set preview bar trên input (huỷ được) → gửi kèm `replyTo`; tin nhắn có `reply_to` hiện 1 khối
  trích dẫn nhỏ phía trên bubble (bấm vào cuộn tới tin gốc qua `id="msg-<id>"` đã có sẵn từ trước).

tsc + lint (0 lỗi mới) + vitest (230/230) PASS — vẫn chưa có eval harness riêng cho Gấu Tổ AI (finding #7,
để làm sau nếu cần). **Cần Hiếu**: không cần migration nào (page_path là field có sẵn, reply_to là cột có
sẵn). QA thủ công: (a) hỏi 1 câu dạng "hệ thống này code bằng gì" trong group → phải bị từ chối lịch sự
thay vì trả lời thật; (b) gõ "tóm tắt hộ cuộc trò chuyện" sau vài chục tin → xem tóm tắt có hợp lý không;
(c) bấm "Trả lời" 1 tin, gửi tin mới → xác nhận preview + trích dẫn hiện đúng, bấm trích dẫn cuộn đúng
tin gốc.

## s196+16 (2026-09-13) — Gấu Tổ AI: stream token thật (SSE)

Đề xuất C (P2) roadmap audit Tổ Gấu s196+5 — trước đây `ai/route.ts` trả 1 cục JSON sau khi chờ TRỌN VẸN
response (khác Bé Gấu/Gấu Pro đã stream từ s195+18), cảm giác chậm hơn hẳn 2 agent kia.

- Backend: mọi bước từ sau khi validate xong (rate-limit/body/group/ai_enabled — các lỗi này vẫn trả JSON
  thường vì xảy ra TRƯỚC khi bắt đầu stream) nay chạy TRONG 1 `ReadableStream` phát SSE (`data:
  {...}\n\n`). 4 loại event: `question` (câu hỏi vừa lưu, id thật — FE thay ngay optimistic), `delta`
  (từng đoạn text Gemini sinh ra, qua `onChunk` của `genWithRetryStream` — trước gọi KHÔNG truyền
  `onChunk`, giờ truyền), `done` (bản ghi câu trả lời đã lưu DB, kèm `error` nếu lưu lỗi), `error` (lỗi
  chung, vd không lưu được câu hỏi).
- FE (`[id]/page.tsx` `askAI()`): đọc `res.body.getReader()`, parse từng khối `data: {...}\n\n` — bong
  bóng AI tạm (`tempAiId`) hiện NGAY khi có `delta` đầu tiên, nối dần theo từng đoạn, rồi thay bằng bản
  ghi thật ở event `done` (khớp dedup Realtime như cũ, không đổi cơ chế reconcile).
- Không đổi logic guardian/tóm tắt/cost-tracking/self-learning (s196+15) — chỉ đổi CÁCH trả kết quả.

tsc + lint (0 lỗi mới) + vitest (230/230) PASS. **Cần Hiếu QA thủ công**: hỏi AI 1 câu trong group, xác
nhận chữ CHẠY DẦN thay vì hiện 1 cục sau khi chờ, không lặp/mất nội dung, câu hỏi/trả lời vẫn lưu đúng
lịch sử sau khi F5.

## s196+17 (2026-09-13) — Realtime cho Docs/Notes/Questions

Đề xuất E (P2) roadmap audit Tổ Gấu s196+5 — 3 panel "Của nhóm" trước chỉ poll 20s (s196+1), member khác
thêm tài liệu/ghi chú/câu hỏi phải chờ tới 20s mới thấy (chat đã Realtime từ v55).

- Migration `v60_to_gau_docs_notes_questions_realtime.sql` — thêm `chat_docs`/`chat_notes`/
  `chat_questions` vào publication `supabase_realtime` (đúng bước từng thiếu cho `chat_messages`, gây bug
  v55).
- `lib/to-gau-realtime.ts` — client Supabase Realtime dùng CHUNG cho cả phòng chat lẫn 3 panel (trước
  `[id]/page.tsx` tự tạo client riêng bằng `createClient()` module-level; nếu mỗi panel cũng tự tạo sẽ mở
  thêm kết nối WebSocket không cần thiết cho cùng 1 trang — tách ra 1 chỗ dùng chung).
- Mỗi panel (`docs-panel.tsx`/`notes-panel.tsx`/`questions-panel.tsx`) thêm 1 subscription
  `postgres_changes` (`event:"*"` — INSERT/UPDATE/DELETE, filter đúng `group_id`) → reload silent khi có
  thay đổi. Đơn giản hơn cách merge từng loại event của `chat_messages` (số dòng thay đổi/lần nhỏ, không
  cần tối ưu) — vẫn giữ nguyên poll 20s làm lưới an toàn (đúng tiền lệ: publication thiếu không throw lỗi
  gì, chỉ im lặng không nhận event).

tsc + lint (0 lỗi mới) + vitest (230/230) PASS. **Cần Hiếu**: chạy migration v60. QA thủ công: mở cùng 1
group bằng 2 tài khoản/2 tab, thêm 1 Doc/Note/Câu hỏi ở tab A → xác nhận tab B thấy gần như ngay lập tức
(không cần đợi 20s hay F5).

## s196+18 (2026-09-13) — Eval harness cho Gấu Tổ AI

Đề xuất F (P2) roadmap audit Tổ Gấu s196+5 — trước hoàn toàn không có test nào (khác Bé Gấu/Gấu Pro đã có
`agent-grade.test.ts`/`gau-pro-grade.test.ts`, LLM-judge). Port THẲNG pattern đó không khả thi mà không
refactor lớn — logic agent nằm nguyên trong `ai/route.ts` (streaming SSE), không có hàm thuần kiểu
`runBeGau()`/`runCreatorAI()` để gọi trực tiếp trong test.

- Tách 2 phần THUẦN nhạy cảm nhất sang `lib/to-gau-ai-helpers.ts` (không đổi hành vi, chỉ đổi vị trí):
  `buildChatHistory()` (merge turn liên tiếp cùng role + cắt turn "model" đứng đầu — đúng lỗi thật đã gặp
  trên staging "First content should be with role 'user', got model"), `isSummaryRequest()`, và
  `searchKB()` (group-scoping Docs/Notes — cùng LỚP rủi ro vừa fix P0 cho Gấu Pro s196+5: quên gate theo
  phạm vi sẽ leak dữ liệu group khác).
- `web/src/__tests__/to-gau-ai-helpers.test.ts` (13 case, chạy trong suite thường — KHÔNG cần Gemini/DB
  thật, mock `supabaseAdmin`): `buildChatHistory` (merge/cắt/rỗng/luân phiên đúng), `isSummaryRequest`
  (nhận diện đúng/không nhầm), `searchKB` (group A và group B lọc ĐÚNG `group_id` tương ứng, không lẫn
  nhau; wiki lọc `is_hidden`/`page_type` đúng theo `privileged`).

`ai/route.ts` không đổi hành vi — chỉ import thay vì định nghĩa local. tsc + lint (0 lỗi mới) + vitest
(243/243, +13 test) PASS. **Cần Hiếu**: không cần làm gì — chạy tự động mỗi lần `npx vitest run` từ nay,
không cần chạy tay/tốn Gemini call như 2 harness live-DB kia.
