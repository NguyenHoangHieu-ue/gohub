# Tab: Tổ Gấu (Group Chat + Tài liệu)

**Route:** `/analytics/to-gau`  
**Room:** `/analytics/to-gau/[id]`  
**Phase:** 5 — gộp Note + Knowledge Base vào Tổ Gấu, phân quyền tài liệu theo group  
**Added:** s142 · s142 Phase 4 · **s163 (2026-08-26): gộp Note/KB, xem §"Tab Tài liệu" bên dưới**

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
