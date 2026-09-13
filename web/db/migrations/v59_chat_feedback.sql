-- v59: Feedback loop 👍/👎 cho Bé Gấu (đề xuất tính năng #3, roadmap audit s196+5)
--
-- Trước đây non-creator không có cách nào đánh giá trực tiếp chất lượng câu trả lời Bé Gấu — chỉ
-- creator/admin xem qua Usage Analytics (LLM-judge nội bộ). Bảng riêng, không đụng app_usage_events
-- (đã có nhiều cột, tách rõ mối quan tâm: feedback là hành động CHỦ ĐỘNG của user, khác event tự động).
CREATE TABLE IF NOT EXISTS chat_feedback (
  id         BIGSERIAL PRIMARY KEY,
  user_email TEXT,
  user_name  TEXT,
  user_role  TEXT,
  agent_id   TEXT,
  question   TEXT,
  answer     TEXT,
  rating     SMALLINT NOT NULL CHECK (rating IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_created_at ON chat_feedback (created_at DESC);
