# Tab: Tổ Gấu (Group Chat)

**Route:** `/analytics/to-gau`  
**Room:** `/analytics/to-gau/[id]`  
**Phase:** 1 MVP (text-only)  
**Added:** s142

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
| ai_enabled | boolean | Dự phòng Phase 2 |
| notify_lark | boolean | Dự phòng Phase 2 |
| is_archived | boolean | Soft delete |
| created_at / updated_at | timestamptz | |

### `chat_group_members`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK → chat_groups | CASCADE |
| user_email | text | |
| user_name | text | Lookup từ users table |
| role | text | 'member' hoặc 'admin' |
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
| msg_type | text | Mặc định 'text' |
| attachments | jsonb | Dự phòng Phase 2 |
| reply_to | uuid FK → chat_messages | Nullable |
| is_pinned | boolean | Dự phòng Phase 2 |
| created_at | timestamptz | |

Index: `idx_chat_messages_group_created ON chat_messages(group_id, created_at DESC)`

---

## API Endpoints

| Method | Path | Guard | Mô tả |
|---|---|---|---|
| GET | `/api/to-gau/groups` | session | List groups (privileged = all; user = chỉ nhóm mình) |
| POST | `/api/to-gau/groups` | creator/admin | Tạo group mới, auto-add creator làm admin |
| GET | `/api/to-gau/groups/[id]` | member / creator | Group info + members |
| PATCH | `/api/to-gau/groups/[id]` | creator/admin | Sửa name/desc/emoji/settings |
| DELETE | `/api/to-gau/groups/[id]` | creator/admin | Xóa group (cascade) |
| GET | `/api/to-gau/groups/[id]/members` | member / creator | Danh sách members |
| POST | `/api/to-gau/groups/[id]/members` | creator/admin | Thêm member |
| DELETE | `/api/to-gau/groups/[id]/members?email=xxx` | creator/admin | Xóa member |
| GET | `/api/to-gau/groups/[id]/messages?limit=50&before=<uuid>` | member / creator | Lấy messages (cursor paging) |
| POST | `/api/to-gau/groups/[id]/messages` | member / creator | Gửi message |

---

## UI Flow

### List page (`/analytics/to-gau`)
- Grid 3 cột: card mỗi group (emoji, tên, mô tả, số member, last message preview)
- Creator/admin: nút "Tạo nhóm" → modal (emoji picker + name + description)
- Empty state friendly

### Chat room (`/analytics/to-gau/[id]`)
- Layout 2 cột: main chat + sidebar members (240px, ẩn mobile)
- Messages: ASC (cũ → mới), scroll-to-bottom tự động
- Bubble: mình = `bg-[#003B95] text-white` align right; người khác = `bg-white border` align left
- Real-time: Supabase Realtime `postgres_changes` INSERT filter `group_id=eq.{id}`
- Optimistic update: append tạm → replace với data thật sau khi API trả về
- Input: Enter gửi, Shift+Enter xuống dòng
- Creator/admin: nút "Cài đặt" trong sidebar → Settings modal (edit group + manage members)

---

## Access Control

- `creator` hoặc `admin` → toàn quyền (tạo group, CRUD, xem all)
- User thường → chỉ thấy/vào group đã được add vào
- 401 nếu không có session; 403 nếu không phải member/privileged
