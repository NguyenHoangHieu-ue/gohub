-- v68: Bảng tin nhắn cho hội thoại chatbot (Bé Gấu web + Gấu Pro).
-- LỖI GỐC (phát hiện s223 QA): migration v34 (Tổ Gấu) đã DROP TABLE chat_messages rồi tạo lại CÙNG TÊN cho chat nhóm
-- (group_id/sender_email..., KHÔNG có conversation_id/role). Từ đó mọi lần lưu/đọc tin hội thoại chatbot đều lỗi âm thầm:
-- `conversations` có ~500 dòng nhưng không tin nhắn nào → mở lại hội thoại cũ chỉ còn dựa localStorage của trình duyệt.
-- Tách bảng riêng, không đụng chat_messages của Tổ Gấu.
CREATE TABLE IF NOT EXISTS conversation_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT        NOT NULL CHECK (role IN ('user','assistant')),
  content          TEXT        NOT NULL DEFAULT '',
  agent_id         TEXT,
  agent_name       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_messages_conv ON conversation_messages (conversation_id, created_at);
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
