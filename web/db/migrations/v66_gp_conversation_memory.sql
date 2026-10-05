-- v66: Gấu Pro G3 — trí nhớ hội thoại (docs/plans/gau-pro-assistant.md).
-- Mỗi hội thoại Gấu Pro có 1 bản tóm tắt + embedding (gemini-embedding-001, 3072 chiều) để tool searchPastConversations
-- tìm lại "lần trước mình bàn gì về X" kèm link mở hội thoại. 3072 chiều vượt giới hạn index HNSW (2000) → quét tuần tự
-- (bảng nhỏ, lọc theo username trước).
CREATE TABLE IF NOT EXISTS gp_conversation_memory (
  conversation_id UUID        PRIMARY KEY,
  username        TEXT        NOT NULL,
  title           TEXT,
  summary         TEXT        NOT NULL,
  message_count   INT         NOT NULL DEFAULT 0,
  embedding       vector(3072),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gp_conv_mem_user ON gp_conversation_memory (username, updated_at DESC);
ALTER TABLE gp_conversation_memory ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

CREATE OR REPLACE FUNCTION match_gp_conversations(
  query_embedding vector(3072),
  p_username      text,
  match_count     int DEFAULT 5
)
RETURNS TABLE(conversation_id uuid, title text, summary text, updated_at timestamptz, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT conversation_id, title, summary, updated_at, 1 - (embedding <=> query_embedding) AS similarity
  FROM gp_conversation_memory
  WHERE username = p_username AND embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
