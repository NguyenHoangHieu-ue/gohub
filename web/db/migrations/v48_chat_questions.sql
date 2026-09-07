-- v48: Tổ Gấu — bảng câu hỏi CS theo trạng thái (chưa/đang/đã xử lý).
-- Trước giờ CS tag người trong tin nhắn/troubleshoot → câu hỏi "trôi mất", không ai biết đã xử lý
-- hay chưa. Bảng này tách câu hỏi ra khỏi luồng chat, có trạng thái theo dõi riêng.

CREATE TABLE IF NOT EXISTS chat_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  asked_by         TEXT NOT NULL, -- username, giống chat_messages.sender_email
  asked_by_name    TEXT,
  status           TEXT NOT NULL DEFAULT 'chua' CHECK (status IN ('chua', 'dang', 'da_xu_ly')),
  answer           TEXT,
  answered_by      TEXT,
  answered_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_questions_group  ON chat_questions (group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_questions_status ON chat_questions (group_id, status);
