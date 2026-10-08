-- v71: Phiếu sửa code (plan be-gau-upgrade.md mốc U5b). Gấu Pro soạn phiếu → Hiếu duyệt (cổng duyệt gp_pending_actions, web hoặc Lark)
-- → GitHub Actions chạy Claude Code trên nhánh auto/ticket-<id> → mở PR vào staging. Workflow báo trạng thái về /api/dev-tickets/callback.
CREATE TABLE IF NOT EXISTS dev_tickets (
  id          BIGSERIAL   PRIMARY KEY,
  title       TEXT        NOT NULL,
  request     TEXT        NOT NULL,                       -- yêu cầu gốc của Hiếu
  plan        TEXT        NOT NULL DEFAULT '',            -- kế hoạch Gấu Pro soạn (Hiếu xem khi duyệt)
  prompt      TEXT        NOT NULL,                       -- yêu cầu đầy đủ gửi Claude Code
  status      TEXT        NOT NULL DEFAULT 'queued',      -- queued | running | question | pr_open | failed | cancelled
  answers     JSONB       NOT NULL DEFAULT '[]'::jsonb,   -- [{ q, a, at }] hỏi đáp giữa chừng
  question    TEXT,                                       -- câu hỏi đang chờ Hiếu trả lời
  summary     TEXT,                                       -- tóm tắt Claude Code ghi khi xong
  branch      TEXT,
  pr_url      TEXT,
  run_url     TEXT,
  error       TEXT,
  created_by  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dev_tickets_created ON dev_tickets (created_at DESC);
ALTER TABLE dev_tickets ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
