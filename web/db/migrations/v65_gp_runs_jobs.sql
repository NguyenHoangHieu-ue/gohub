-- v65: Gấu Pro G2 (docs/plans/gau-pro-assistant.md)
--   gp_runs : trace mỗi lượt chạy runCreatorAI (các bước tool + vòng model, thời gian, token) — 1 dòng/lượt, ghi 1 lần cuối lượt.
--   gp_jobs : việc chạy nền ("Giao việc") — chạy từng chặng ≤ ~4 phút, tự gọi chặng tiếp (không dùng Vercel Workflow vì gói Hobby).

CREATE TABLE IF NOT EXISTS gp_runs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username     TEXT,
  channel      TEXT,                     -- web | lark_dm | cron | job
  question     TEXT,
  steps        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  skills       TEXT[],
  tokens_in    INT         NOT NULL DEFAULT 0,
  tokens_out   INT         NOT NULL DEFAULT 0,
  duration_ms  INT,
  outcome      TEXT,                     -- done | stopped | unfinished | error
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gp_runs_created ON gp_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gp_runs_user ON gp_runs (username, created_at DESC);
ALTER TABLE gp_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS gp_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT        NOT NULL,
  is_creator      BOOLEAN     NOT NULL DEFAULT false,
  title           TEXT        NOT NULL,
  prompt          TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','running','done','failed','cancelled')),
  chunks          INT         NOT NULL DEFAULT 0,
  checkpoint      JSONB,                 -- contents Gemini đã rút gọn để chạy chặng tiếp
  result          TEXT,
  error           TEXT,
  conversation_id UUID,                  -- hội thoại chứa kết quả (mở lại trên web)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gp_jobs_user ON gp_jobs (username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gp_jobs_status ON gp_jobs (status, updated_at);
ALTER TABLE gp_jobs ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
