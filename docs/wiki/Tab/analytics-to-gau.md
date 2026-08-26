# Tab: Tổ Gấu (Group Chat + Tài liệu)

**Route:** `/analytics/to-gau`  
**Room:** `/analytics/to-gau/[id]`  
**Phase:** 5 — gộp Note + Knowledge Base vào Tổ Gấu, phân quyền tài liệu theo group  
**Added:** s142 · s142 Phase 4 · **s163 (2026-08-26): gộp Note/KB, xem §"Tab Tài liệu" bên dưới**

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
| user_email | text | |
| user_name | text | Lookup từ users table |
| role | text | 'member' \| 'manager' \| 'admin' — manager thêm/xoá được member + ghim tin nhắn, KHÔNG đổi role/xoá group |
| added_by | text | Email người thêm |
| added_at | timestamptz | |
| UNIQUE | (group_id, user_email) | |

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
  gán nhóm) | **Của nhóm** (📄 Docs + 📌 Notes như cũ, member trong group tự up — không đổi logic, chỉ đổi vị trí UI)
- Messages: ASC (cũ → mới), scroll-to-bottom auto, real-time INSERT + UPDATE
- Bubble: mình = `bg-[#003B95] text-white` right; người khác = `bg-white border` left; AI = indigo gradient
- Hover trên bubble → nút Ghim (creator/admin) absolute
- Input bar: paperclip + textarea (@mention dropdown) + AI button + Send

---

## Access Control

- `creator` hoặc `admin` → toàn quyền (tạo group, CRUD, xem all, pin)
- User thường → chỉ thấy/vào group đã được add vào; không pin được
- 401 nếu không có session; 403 nếu không phải member/privileged
