---
title: "Creator Settings"
page_type: tab_guide
is_hidden: true
updated: 2026-08-18
---

# Creator Settings — `/analytics/creator`

**Route:** `/analytics/creator`  
**Page file:** `web/src/app/(dashboard)/analytics/creator/page.tsx`  
**APIs liên quan:**
- `GET/POST /api/config/tab-visibility`
- `GET /api/config/creator-status`
- `GET/POST /api/creator-ai/gp-access`
- `GET/POST /api/creator/my-metrics-access`
- `GET/PUT/POST /api/creator/ca-thread`
- `GET /api/lark/oauth/status`

## Mục đích

Trang cấu hình dành riêng cho **creator** (và admin). Tập trung các công cụ quản trị:
1. Ẩn/hiện tab theo role
2. Cấp quyền Gấu Pro theo user
3. Cấp quyền xem My Metrics theo user
4. Cà Thread Lark (nhắc follow-up các thread chưa có reaction YES)

## Phân quyền

- **creator + admin** mới vào được (redirect `/chatbot` nếu thiếu quyền)
- Role được fetch tươi từ `/api/user/me` để tránh JWT stale

---

## Section 1 — Ma trận ẩn Tab

Cho phép creator ẩn/hiện từng tab với từng role cụ thể.

- **Source:** Supabase `app_settings`, key `tab_visibility`, category `permissions`
- **API:** `GET /api/config/tab-visibility` (đọc), `POST /api/config/tab-visibility` (lưu)
- **Default hidden:** `api-database` (ẩn với tất cả role trừ creator)
- **Creator luôn thấy tất cả** dù config ẩn

## Section 2 — Gấu Pro Access

Danh sách user được phép dùng Gấu Pro (ngoài creator).

- **Source:** Supabase `app_settings`, key `gp_allowed_users`
- **API:** `GET/POST /api/creator-ai/gp-access`
- Thêm theo `username`, không phải email

## Section 3 — My Metrics Access

Danh sách user được thấy tab My Metrics trong sidebar.

- **Source:** Supabase `app_settings`, key `my_metrics_users`
- **API:** `GET/POST /api/creator/my-metrics-access`
- User được cấp quyền thấy My Metrics trong section "Personal" ở sidebar

---

## Section 4 — Cà Thread Lark

### Mục đích

Bot quét group Lark, tìm các thread có reply nhưng chưa có reaction YES (reaction đồng ý/done). Hiếu click Cà từng thread để gửi tin nhắn nhắc @mention các người liên quan.

### Config (lưu 1 lần)

- **Source:** Supabase `app_settings`, key `ca_thread_config`, category `lark_tool`
- **API:** `GET /api/creator/ca-thread` (đọc), `PUT /api/creator/ca-thread` (lưu)
- **Các field config:**
  - `chat_id` — ID group Lark (dạng `oc_xxxxxxxx`)
  - `emoji_type` — tên emoji phản ứng YES (default: `THUMBSUP`)
  - `days_back` — số ngày quét ngược (default: 7)
  - `my_open_id` — open_id của Hiếu để exclude khỏi danh sách tag

### Luồng "Quét và Cà" (s151)

**Bước 1 — Quét:**
- Bấm "Quét N ngày gần đây"
- API `POST { action: "scan" }`:
  1. Lấy danh sách thành viên group qua Lark Members API (`/im/v1/chats/{chat_id}/members`) để build name map
  2. Lấy 50 messages gần nhất trong chat
  3. Lọc root messages (có `thread_id`, không có `root_id`) trong khoảng `days_back`
  4. Song song cho từng thread: lấy replies + reactions
  5. Bỏ qua thread đã có reaction YES hoặc chưa có reply
  6. Trả về danh sách `ThreadScan` đầy đủ

**Bước 2 — Xem và Cà:**
- Mỗi thread card hiện:
  - Nội dung tin gốc (có "xem thêm" nếu dài > 150 ký tự)
  - Badge ngày + "X ngày trước"
  - Số reply · toggle hiện replies (sender name + nội dung)
  - Danh sách người liên quan (@name chips)
  - Nút **Cà**
- Click Cà → panel preview mở inline bên dưới:
  - Toggle từng người được tag (click để bật/tắt)
  - Textarea chỉnh sửa nội dung tin
  - Box xem trước câu cà sẽ gửi
  - Nút **Gửi ngay** → API `POST { action: "send" }`
- Sau khi gửi: card chuyển sang trạng thái "Đã cà ✓" (mờ, badge emerald)

**Bước 3 — Gửi (action: send):**
- API `POST { action: "send", message_id, participants[], message_text }`:
  1. Lấy `userToken` (OAuth Lark cá nhân của Hiếu)
  2. Build Lark `post` message: `[...@mentions, text]`
  3. Gửi reply vào thread (`/im/v1/messages/{message_id}/reply`)

### Token dùng

| Thao tác | Token |
|---|---|
| Đọc messages, reactions, members | App token (bot Bé Gấu) |
| Gửi tin nhắn cà | User token OAuth (tên Hiếu) |

### Resolve tên user

1. **Lark Members API** — lấy tất cả thành viên group với tên hiển thị
2. **Mentions inline** — tin nhắn Lark có `mentions[]` kèm `name` → bổ sung vào name map
3. **Fallback** — nếu không resolve được → hiện `open_id` thô

### Gotchas đã gặp

- `container_id_type` không phải `container_type` (bug gốc s150, đã fix)
- Tin nhắn gửi bằng **user token** để hiện tên Hiếu; dùng app token sẽ hiện tên bot
- Scope Lark cần có: `im:message`, `im:message.reaction:readonly`, `im:chat:readonly`
- Sau khi thêm scope → PHẢI publish version mới trong Lark Developer Console
- Lark Members API có thể trả lỗi nếu thiếu scope → code xử lý graceful (tiếp tục với nameMap từ mentions)
- Promise.all cho các thread song song → tránh timeout Vercel 10s

### Files liên quan

```
web/src/app/api/creator/ca-thread/route.ts   ← API scan + send
web/src/app/(dashboard)/analytics/creator/page.tsx  ← CaThreadSection component
web/src/lib/lark.ts                          ← getLarkToken, getLarkUserToken, exchangeLarkCode
web/src/app/api/lark/oauth/*/route.ts        ← Lark OAuth flow
```
