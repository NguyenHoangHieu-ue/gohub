-- v31: chatbot_learning_log — Bé Gấu tự học từ non-creator users
-- Hiếu chạy file này trên Supabase SQL Editor
-- s132 (2026-08-04)

CREATE TABLE IF NOT EXISTS chatbot_learning_log (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          text        NOT NULL,         -- session user id
  user_role        text        NOT NULL,         -- standard/manager/admin/b2b/saleb2c/...
  user_name        text,                         -- display name nếu biết
  session_id       text,
  message_content  text        NOT NULL,         -- câu user nói
  detected_info    text        NOT NULL,         -- thông tin Gấu extract ra
  learning_type    text        NOT NULL,         -- NEW | CONFLICT | CONFIRM
  existing_kb_key  text,                         -- nếu CONFLICT: key của KB entry mâu thuẫn
  conflict_detail  text,                         -- mô tả mâu thuẫn cụ thể
  severity         text        DEFAULT 'MEDIUM', -- HIGH | MEDIUM | LOW
  status           text        DEFAULT 'pending',-- pending | approved | rejected | ignored
  created_at       timestamptz DEFAULT now(),
  reviewed_at      timestamptz,
  reviewed_by      text
);

-- Index để query pending items nhanh
CREATE INDEX IF NOT EXISTS chatbot_learning_log_status_idx ON chatbot_learning_log(status);
CREATE INDEX IF NOT EXISTS chatbot_learning_log_created_idx ON chatbot_learning_log(created_at DESC);

-- Lưu Lark user ID của creator để Bé Gấu gửi DM thông báo tự học
-- Hiếu chạy dòng này nếu muốn lưu vào DB (code đã hardcode fallback rồi nên không bắt buộc)
INSERT INTO app_settings (key, value)
VALUES ('creator_lark_user_id', 'lark_ou_e5af3c7f447984052c1c5a5c2f5')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
