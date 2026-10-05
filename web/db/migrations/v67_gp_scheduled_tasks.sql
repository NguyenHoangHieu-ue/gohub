-- v67: Gấu Pro G4 — việc theo lịch do người dùng tự đặt bằng chat (docs/plans/gau-pro-assistant.md).
-- Đến hạn → tạo 1 việc nền (gp_jobs, v65) chạy prompt ĐẦY ĐỦ đã lưu → kết quả nhắn Lark DM.
-- only_if_notable = "canh chừng": chỉ nhắn khi điều kiện trong prompt xảy ra (model trả NO_ALERT thì im).
CREATE TABLE IF NOT EXISTS gp_scheduled_tasks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username         TEXT        NOT NULL,
  is_creator       BOOLEAN     NOT NULL DEFAULT false,
  title            TEXT        NOT NULL,
  prompt           TEXT        NOT NULL,
  schedule         JSONB       NOT NULL,       -- { kind: daily|weekly|monthly|once, time: "HH:mm" (giờ VN), weekdays?: [1..7], day?: 1..31, date?: "YYYY-MM-DD" }
  only_if_notable  BOOLEAN     NOT NULL DEFAULT false,
  active           BOOLEAN     NOT NULL DEFAULT true,
  next_run_at      TIMESTAMPTZ,
  last_run_at      TIMESTAMPTZ,
  run_count        INT         NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gp_sched_due ON gp_scheduled_tasks (active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_gp_sched_user ON gp_scheduled_tasks (username, created_at DESC);
ALTER TABLE gp_scheduled_tasks ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
