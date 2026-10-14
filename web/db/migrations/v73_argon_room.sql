-- v73: Phòng Argon (plan docs/plans/argon-room.md) — kho tài liệu + trợ lý Gemini 4 Argon, chỉ Creator.
-- Dự án = tập nguồn (file tải lên / link Lark / mail Lark / ghi chú) + sổ dự án + lịch sử các lượt chạy.
-- File gốc nằm ở Supabase Storage bucket riêng tư `argon-room` (code tự tạo bucket).

CREATE TABLE IF NOT EXISTS argon_projects (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username     TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  notes        TEXT        NOT NULL DEFAULT '',            -- "sổ dự án": tóm tắt, quyết định, câu hỏi mở (luôn nằm đầu ngữ cảnh)
  instructions TEXT        NOT NULL DEFAULT '',            -- chỉ dẫn riêng của dự án (văn phong, ràng buộc)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_argon_projects_user ON argon_projects (username, updated_at DESC);

CREATE TABLE IF NOT EXISTS argon_sources (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID        NOT NULL REFERENCES argon_projects(id) ON DELETE CASCADE,
  kind           TEXT        NOT NULL CHECK (kind IN ('file','lark','mail','note')),
  name           TEXT        NOT NULL,
  mime           TEXT,
  size_bytes     BIGINT,
  storage_path   TEXT,                                     -- file gốc (kind=file)
  extracted_text TEXT,                                     -- văn bản đã trích / nội dung ghi chú / snapshot Lark / thân mail
  send_binary    BOOLEAN     NOT NULL DEFAULT false,       -- true: gửi file gốc cho model (PDF/ảnh/video/audio) thay vì văn bản trích
  tokens         INTEGER     NOT NULL DEFAULT 0,           -- ước lượng token khi nạp (countTokens)
  content_hash   TEXT,
  external_url   TEXT,                                     -- link Lark
  external_id    TEXT,                                     -- token doc/mail id
  sync_mode      TEXT        CHECK (sync_mode IN ('snapshot','live')),
  synced_at      TIMESTAMPTZ,
  enabled        BOOLEAN     NOT NULL DEFAULT true,
  pinned         BOOLEAN     NOT NULL DEFAULT false,
  version        INTEGER     NOT NULL DEFAULT 1,
  meta           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_argon_sources_project ON argon_sources (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_argon_sources_ext ON argon_sources (external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS argon_source_versions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      UUID        NOT NULL REFERENCES argon_sources(id) ON DELETE CASCADE,
  version        INTEGER     NOT NULL,
  extracted_text TEXT,
  storage_path   TEXT,
  note           TEXT,                                     -- vd "Sửa tay", "Argon đề xuất — đã duyệt"
  author         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_argon_versions_source ON argon_source_versions (source_id, version DESC);

CREATE TABLE IF NOT EXISTS argon_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES argon_projects(id) ON DELETE CASCADE,
  username      TEXT        NOT NULL,
  prompt        TEXT        NOT NULL,
  answer        TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'running',    -- running | done | error | stopped | partial (hết thời gian đoạn, có thể "Tiếp tục")
  model         TEXT,
  thinking      TEXT,
  source_ids    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tokens_in     INTEGER     NOT NULL DEFAULT 0,
  tokens_out    INTEGER     NOT NULL DEFAULT 0,
  cached_in     INTEGER     NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10,4) NOT NULL DEFAULT 0,
  duration_ms   INTEGER     NOT NULL DEFAULT 0,
  segments      INTEGER     NOT NULL DEFAULT 1,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_argon_runs_project ON argon_runs (project_id, created_at);

ALTER TABLE argon_projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE argon_sources         ENABLE ROW LEVEL SECURITY;
ALTER TABLE argon_source_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE argon_runs            ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
