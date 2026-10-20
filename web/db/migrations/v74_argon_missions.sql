-- v74: Phòng Argon remake — Sứ mệnh + workspace (plan docs/plans/argon-missions.md).
-- Mỗi sứ mệnh có MỘT dự án nền (argon_projects.kind='mission') nên nguồn, lượt chạy, việc nền, Kho báo cáo dùng lại nguyên.
-- Không có ngân sách $ cho Argon (Hiếu chốt 2026-10-20): chi tiêu chỉ hiện, tính từ argon_runs.cost_usd.

ALTER TABLE argon_projects ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'project';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'argon_projects_kind_check') THEN
    ALTER TABLE argon_projects ADD CONSTRAINT argon_projects_kind_check CHECK (kind IN ('project','mission'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS argon_missions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT        NOT NULL,
  project_id    UUID        NOT NULL UNIQUE REFERENCES argon_projects(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  goal          TEXT        NOT NULL DEFAULT '',
  phase         TEXT        NOT NULL DEFAULT 'clarify' CHECK (phase IN ('clarify','plan','run','done','paused')),
  committed_at  TIMESTAMPTZ,                               -- lúc Hiếu bấm "Chốt"
  archived      BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_argon_missions_user ON argon_missions (username, archived, updated_at DESC);

CREATE TABLE IF NOT EXISTS argon_workspace_files (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id    UUID        NOT NULL REFERENCES argon_missions(id) ON DELETE CASCADE,
  path          TEXT        NOT NULL,                      -- vd "scripts/so_gia.py"; thư mục là ảo, suy ra từ path
  mime          TEXT,
  content       TEXT,                                      -- file chữ ≤ 1MB
  storage_path  TEXT,                                      -- file nhị phân (xlsx, ảnh) ở bucket argon-room
  size_bytes    BIGINT      NOT NULL DEFAULT 0,
  author        TEXT        NOT NULL DEFAULT 'user' CHECK (author IN ('user','argon')),
  version       INTEGER     NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, path)
);

CREATE TABLE IF NOT EXISTS argon_mission_sources (
  mission_id    UUID        NOT NULL REFERENCES argon_missions(id) ON DELETE CASCADE,
  source_id     UUID        NOT NULL REFERENCES argon_sources(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mission_id, source_id)
);

ALTER TABLE argon_missions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE argon_workspace_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE argon_mission_sources ENABLE ROW LEVEL SECURITY;
