# Plan: GoHub Intel — Tổ Gấu 🐻

> Ngày lên plan: 2026-08-11 | Cập nhật: 2026-08-11
> Người yêu cầu: Hiếu
> Tên feature: **Tổ Gấu** (nhất quán với Bé Gấu / Gấu Pro)
> Mục tiêu: Tạo một nơi tập trung trên Intel để team nội bộ giao tiếp, lưu ghi chú, tra cứu tài liệu sản phẩm, và hỏi nhanh trợ lý AI — tất cả trong 1 giao diện, kiểm soát bởi creator.

### Đã xác nhận
| Câu hỏi | Quyết định |
|---|---|
| Tên feature | **Tổ Gấu** 🐻 |
| lark_id member | Lấy từ `users.lark_open_id` (đã lưu khi login Lark) — không lưu riêng |
| AI conversation | **Nhớ lịch sử** — pass N messages gần nhất trong group làm context |
| Upload docs | **Supabase Storage** — bucket `to-gau-files` (public, download được) |
| Thứ tự làm | Phase 1 → 2 → 3 → 4 |

---

## 1. Tổng quan tính năng

| Tính năng | Mô tả |
|---|---|
| **Multi-group** | Tạo nhiều group (VD: Sale Team, BD Team, Ops...) |
| **Access control** | Creator toàn quyền; user chỉ thấy group được add vào |
| **Chat** | Real-time, hỗ trợ text / ảnh / file |
| **Ghi chú (Notes)** | Pin note dùng chung trong group |
| **Tài liệu (Docs)** | Upload/xem document sản phẩm ngay trong group |
| **Trợ lý AI** | Gấu Pro giới hạn scope theo group (VD: chỉ nói về giá SP, SKU...) |
| **Thông báo Lark** | Push DM Lark cho member khi có tin nhắn mới / @mention |
| **AI Scope Config** | Creator set nhanh topic AI được phép trả lời per-group |

---

## 2. Data Model (Supabase)

### 2.1 `chat_groups`
```sql
CREATE TABLE chat_groups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  avatar_emoji  text DEFAULT '💬',
  created_by    text NOT NULL,           -- email creator
  ai_enabled    boolean DEFAULT true,
  ai_scope      text,                    -- mô tả ngắn scope AI (VD: "Chỉ trả lời về giá, SKU, availability")
  ai_system_prompt_append text,          -- inject vào system prompt Gấu Pro
  notify_lark   boolean DEFAULT true,    -- bật/tắt notify Lark
  is_archived   boolean DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
```

### 2.2 `chat_group_members`
```sql
CREATE TABLE chat_group_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_email  text NOT NULL,
  user_name   text,
  -- lark_open_id KHÔNG lưu ở đây — look up từ users.lark_open_id khi cần notify
  role        text DEFAULT 'member',     -- 'admin' (creator) | 'member'
  added_by    text,
  added_at    timestamptz DEFAULT now(),
  UNIQUE(group_id, user_email)
);
```

### 2.3 `chat_messages`
```sql
CREATE TABLE chat_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid REFERENCES chat_groups(id) ON DELETE CASCADE,
  sender_email  text NOT NULL,
  sender_name   text NOT NULL,
  content       text,                    -- markdown OK
  msg_type      text DEFAULT 'text',     -- 'text' | 'image' | 'file' | 'ai' | 'note' | 'system'
  attachments   jsonb DEFAULT '[]',      -- [{url, name, size, type}]
  reply_to      uuid REFERENCES chat_messages(id),
  is_pinned     boolean DEFAULT false,
  ai_context    jsonb,                   -- nếu msg_type='ai': {scope, model, tokens_used}
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX chat_messages_group_created ON chat_messages(group_id, created_at DESC);
```

### 2.4 `chat_docs`
```sql
CREATE TABLE chat_docs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid REFERENCES chat_groups(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text,                      -- markdown nội dung / mô tả
  file_url    text,                      -- link file nếu upload
  file_name   text,
  file_type   text,                      -- pdf/xlsx/image/...
  tags        text[],
  uploaded_by text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);
```

> **Storage bucket**: `chat-attachments` (public) — upload file/ảnh vào đây, lấy URL lưu vào `chat_messages.attachments` hoặc `chat_docs.file_url`.

---

## 3. API Routes

```
/api/groupchat/
├── groups/
│   ├── GET              → danh sách group mình có quyền truy cập
│   ├── POST             → tạo group mới (creator only)
│   └── [id]/
│       ├── GET          → thông tin group + config
│       ├── PATCH        → cập nhật group (creator only)
│       ├── DELETE       → xóa/archive group (creator only)
│       ├── members/
│       │   ├── GET      → danh sách member
│       │   ├── POST     → thêm member
│       │   └── DELETE   → xóa member
│       ├── messages/
│       │   ├── GET      → lấy tin nhắn (cursor-based pagination, 50/page)
│       │   └── POST     → gửi tin nhắn
│       ├── docs/
│       │   ├── GET      → danh sách tài liệu
│       │   └── POST     → upload/tạo doc
│       └── ai/
│           └── POST     → hỏi AI (scope giới hạn theo group)
└── upload/
    └── POST             → upload ảnh/file lên Supabase Storage
```

---

## 4. UI/UX Design

### 4.1 Layout tổng thể

```
/analytics/groupchat
├── Sidebar trái (240px) — danh sách group
│   ├── [avatar] Group A   (unread badge)
│   ├── [avatar] Group B
│   └── [+ Tạo group]      (creator only)
│
└── Main area
    ├── Header: Tên group | Members count | [Settings ⚙️]
    ├── Tab bar: [💬 Chat] [📌 Notes] [📄 Docs]
    │
    ├── [Tab: Chat]
    │   ├── Messages area (scroll)
    │   │   ├── Message (text / ảnh / file / AI response)
    │   │   └── [🤖 AI reply — icon riêng]
    │   └── Input bar
    │       ├── [📎 Đính kèm] [🖼️ Ảnh] [🤖 Hỏi AI]
    │       └── Textarea + [Gửi]
    │
    ├── [Tab: Notes]
    │   ├── Danh sách notes đã pin
    │   └── [+ Thêm note]
    │
    └── [Tab: Docs]
        ├── Danh sách document
        ├── [Upload file]
        └── [Xem / Download]
```

### 4.2 Modal Settings (creator only)
```
⚙️ Cài đặt Group
├── Thông tin: Tên, Mô tả, Emoji
├── Members: Thêm/xóa (search by email)
│   └── Mỗi member: Avatar | Email | Lark ID | [Xóa]
├── Trợ lý AI
│   ├── [Toggle] Bật/tắt AI
│   ├── Scope (textarea): "Chỉ được trả lời về..."
│   │   Quick presets: [Sale] [BD] [Ops] [Không giới hạn]
│   └── Preview prompt sẽ inject
└── Thông báo Lark
    └── [Toggle] Push Lark khi có tin nhắn mới
```

### 4.3 Giao diện tin nhắn AI
```
┌─────────────────────────────────────────────────┐
│ 🤖 Gấu Pro  [AI • Scope: Sale Team]    10:32 AM │
├─────────────────────────────────────────────────┤
│ Dạ gói EVNJP030 hiện có giá bán 450.000đ,      │
│ available tại kênh B2B và B2C...               │
│                                                 │
│ [Nguồn: Supabase SKU catalog]                   │
└─────────────────────────────────────────────────┘
```

---

## 5. Logic chi tiết

### 5.1 Access Control

```
Creator (Hiếu):
  - Thấy TẤT CẢ group
  - Tạo / xóa / archive group
  - Add / remove member bất kỳ
  - Cấu hình AI scope
  - Cấu hình Lark notify

Member (được add):
  - Chỉ thấy group mình có trong chat_group_members
  - Đọc/gửi tin nhắn, đọc docs, hỏi AI
  - KHÔNG thấy group khác

Middleware guard: mọi API /api/groupchat/* đều check session.user.email có trong chat_group_members.user_email hoặc là creator.
```

### 5.2 Real-time (Supabase Realtime)

```typescript
// FE subscribe khi vào group
supabase
  .channel(`group:${groupId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'chat_messages',
    filter: `group_id=eq.${groupId}`,
  }, (payload) => {
    setMessages(prev => [...prev, payload.new])
  })
  .subscribe()
```

Fallback: polling 5 giây nếu Realtime không khả dụng.

### 5.3 Upload file/ảnh

```
FE → POST /api/groupchat/upload (multipart)
  → server upload lên Supabase Storage bucket 'chat-attachments'
  → trả về { url, name, size, type }
FE → POST /api/groupchat/[id]/messages với attachments: [{ url, name, ... }]
```

Giới hạn: 20MB/file, allow: image/*, pdf, xlsx, docx, txt.

### 5.4 AI với scope giới hạn

```typescript
// Khi user bấm "Hỏi AI" trong group
const systemAppend = group.ai_system_prompt_append || ""
const scopeGuard = group.ai_scope
  ? `\n\nGIỚI HẠN PHẠM VI: ${group.ai_scope}. Nếu câu hỏi nằm ngoài phạm vi này, lịch sự từ chối và hướng dẫn user liên hệ Hiếu.`
  : ""

// Inject vào Gấu Pro system prompt
const systemPrompt = BASE_GAU_PRO_PROMPT + systemAppend + scopeGuard
```

**Quick presets AI scope:**
| Preset | Scope inject |
|---|---|
| Sale Team | "Chỉ trả lời về giá bán, tình trạng stock, SKU code, so sánh gói. KHÔNG tiết lộ COGS, margin, hay thông tin nội bộ." |
| BD Team | "Trả lời về specs kỹ thuật, thông tin thị trường, báo giá so sánh NCC. KHÔNG tiết lộ chiến lược kinh doanh nội bộ." |
| Ops Team | "Trả lời về quy trình nhập hàng, tracking đơn, trạng thái kho. KHÔNG tiết lộ chi phí vận hành." |
| Không giới hạn | (empty — Gấu Pro full capability) |

### 5.5 Lark Notification

```typescript
// Khi có message mới (server-side, sau khi INSERT)
const members = await getGroupMembers(groupId)
for (const member of members) {
  if (!member.lark_id || member.user_email === senderEmail) continue
  await sendLarkDM(member.lark_id, {
    title: `[${groupName}] ${senderName}`,
    content: content.slice(0, 100) + (content.length > 100 ? "..." : ""),
    link: `https://gohub-intel.vercel.app/analytics/groupchat/${groupId}`,
  })
}
```

Chỉ notify khi:
- `group.notify_lark === true`
- Member có `lark_id` đã set
- Không notify chính người gửi
- Rate limit: không notify quá 1 lần/30s/member/group (tránh spam)

---

## 6. Migration

```sql
-- v34_groupchat.sql (chạy trong Supabase SQL Editor)
-- Tạo 4 bảng: chat_groups, chat_group_members, chat_messages, chat_docs
-- Tạo bucket 'chat-attachments' (public, 20MB limit)
```

---

## 7. Routes & Files cần tạo

### Backend (API)
```
web/src/app/api/groupchat/
├── groups/route.ts              GET (list) + POST (create)
├── groups/[id]/route.ts         GET + PATCH + DELETE
├── groups/[id]/members/route.ts GET + POST + DELETE
├── groups/[id]/messages/route.ts GET + POST
├── groups/[id]/docs/route.ts    GET + POST
├── groups/[id]/ai/route.ts      POST (Gấu Pro limited)
└── upload/route.ts              POST (file upload)
```

### Frontend (Pages)
```
web/src/app/(dashboard)/analytics/groupchat/
├── page.tsx                     List groups + sidebar
└── [id]/page.tsx                Chat room (Chat | Notes | Docs tabs)
```

### Components
```
web/src/components/groupchat/
├── GroupSidebar.tsx             Danh sách group
├── ChatArea.tsx                 Messages + input bar
├── MessageItem.tsx              1 tin nhắn (text/image/file/ai)
├── FileUploader.tsx             Upload ảnh/file
├── NotesPanel.tsx               Tab Ghi chú
├── DocsPanel.tsx                Tab Tài liệu
└── GroupSettingsModal.tsx       Modal cài đặt (creator only)
```

### Lib
```
web/src/lib/groupchat.ts         Helpers: sendLarkNotify, checkMembership, ...
web/db/migrations/v34_groupchat.sql
```

---

## 8. Phân chia Phase

### Phase 1 — MVP (ưu tiên cao)
- [ ] Migration v34 (4 bảng + bucket)
- [ ] API: groups CRUD + members + messages
- [ ] Page list groups + chat room cơ bản
- [ ] Real-time via Supabase Realtime
- [ ] Access control (creator vs member)
- [ ] Gửi/nhận text message

### Phase 2 — File & AI
- [ ] Upload ảnh/file (Supabase Storage)
- [ ] Preview ảnh inline trong chat
- [ ] Tích hợp AI với scope giới hạn
- [ ] Quick presets AI scope trong Settings

### Phase 3 — Docs & Notes
- [ ] Tab Docs: upload/xem/download file
- [ ] Tab Notes: pin note dùng chung
- [ ] Reply to message

### Phase 4 — Notifications & Polish
- [ ] Lark notification với rate limit
- [ ] Unread count badge trong sidebar
- [ ] @mention (highlight + notify riêng người được tag)
- [ ] Message search
- [ ] Archive group

---

## 9. Những gì Hiếu cần làm

| Việc | Khi nào |
|---|---|
| Chạy migration v34 trong Supabase SQL Editor | Trước khi deploy Phase 1 |
| Tạo bucket `chat-attachments` (public, 20MB) trong Supabase Storage | Trước khi deploy Phase 2 |
| Set `lark_id` cho từng user khi add vào group | Khi dùng Phase 4 (Lark notify) |

---

## 10. Ước tính độ phức tạp

| Phase | Files | LOC ước tính | Thời gian AI |
|---|---|---|---|
| Phase 1 (MVP) | ~8 | ~800 | 1 session |
| Phase 2 (File + AI) | ~5 | ~500 | 0.5 session |
| Phase 3 (Docs + Notes) | ~4 | ~400 | 0.5 session |
| Phase 4 (Notify + Polish) | ~3 | ~300 | 0.5 session |

**Khuyến nghị**: Làm Phase 1 + 2 trước để có sản phẩm dùng được. Phase 3+4 là nice-to-have.

---

## 11. Trạng thái implementation

| Phase | Status |
|---|---|
| Phase 1 — MVP chat | ✅ Xong (commit 602a553) |
| Phase 2 — File + AI | ⏳ Chờ |
| Phase 3 — Docs + Notes | ⏳ Chờ |
| Phase 4 — Notify + Polish | ⏳ Chờ |
