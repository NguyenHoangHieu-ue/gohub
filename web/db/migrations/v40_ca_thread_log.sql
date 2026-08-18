-- v40: lịch sử "đã cà" thread Lark — chống nhắc trùng / quên
-- id = message_id của thread gốc (unique per thread)

CREATE TABLE IF NOT EXISTS ca_thread_log (
  id           TEXT PRIMARY KEY,        -- message_id thread gốc
  chat_id      TEXT NOT NULL,
  thread_id    TEXT,
  content_snip TEXT,                    -- 150 ký tự đầu để nhận diện
  participants TEXT,                    -- JSON array tên người đã tag
  message_sent TEXT,                    -- câu cà đã gửi
  sent_by      TEXT,                    -- username người bấm
  sent_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_thread_log_chat ON ca_thread_log (chat_id);
CREATE INDEX IF NOT EXISTS idx_ca_thread_log_sent_at ON ca_thread_log (sent_at DESC);
