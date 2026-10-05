-- v64: Hành động Gấu Pro chờ người dùng duyệt (cổng duyệt G0, docs/plans/gau-pro-assistant.md).
-- Khi tool ghi/gửi ra ngoài cần duyệt (lib/agents/creator/tool-policy.ts), tool KHÔNG chạy mà lưu 1 dòng ở đây;
-- người dùng bấm Duyệt (web) hoặc gõ "duyệt <code>" (Lark DM) → server chạy đúng tool + tham số đã lưu.
CREATE TABLE IF NOT EXISTS gp_pending_actions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT        NOT NULL,                 -- mã ngắn 6 ký tự để gõ trên Lark
  username     TEXT        NOT NULL,
  tool         TEXT        NOT NULL,
  args         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  reason       TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected','executed','failed','expired')),
  result       JSONB,
  channel      TEXT,                                 -- web | lark_dm
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gp_pending_user_code ON gp_pending_actions (username, code);
CREATE INDEX IF NOT EXISTS idx_gp_pending_status ON gp_pending_actions (status, created_at DESC);

ALTER TABLE gp_pending_actions ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
