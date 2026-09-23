-- v63: Trí nhớ dài hạn riêng cho trợ lý (Gấu Pro của creator) — TÁCH khỏi creator_kb (kiến thức nghiệp vụ, đọc được
-- bởi mọi role). Mỗi dòng = 1 điều đáng nhớ về người dùng; nạp vào system prompt mỗi lượt (lib/assistant-memory.ts).
CREATE TABLE IF NOT EXISTS assistant_memory (
  id           BIGSERIAL   PRIMARY KEY,
  username     TEXT        NOT NULL,
  kind         TEXT        NOT NULL DEFAULT 'other'
               CHECK (kind IN ('profile','preference','project','person','decision','other')),
  content      TEXT        NOT NULL,
  source       TEXT,                       -- web | lark_dm | lark_group | manual
  pinned       BOOLEAN     NOT NULL DEFAULT false,
  archived     BOOLEAN     NOT NULL DEFAULT false,   -- "quên" = archive, khôi phục được
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assistant_memory_user ON assistant_memory (username, archived, pinned DESC, updated_at DESC);

ALTER TABLE assistant_memory ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
