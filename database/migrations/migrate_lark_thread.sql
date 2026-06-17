-- Thêm thread_id vào lark_chat_history để scope history theo từng thread Lark
ALTER TABLE lark_chat_history ADD COLUMN IF NOT EXISTS thread_id TEXT;

-- Index để query nhanh theo thread
CREATE INDEX IF NOT EXISTS idx_lark_chat_history_thread_id ON lark_chat_history(thread_id);
