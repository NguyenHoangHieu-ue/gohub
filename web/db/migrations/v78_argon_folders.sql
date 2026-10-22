-- v78: Kho nguồn của Phòng Argon kiểu "drive" (plan docs/plans/argon-hub.md, bước 2).
-- Thư mục lồng nhau theo từng Creator; nguồn gán vào thư mục qua argon_sources.folder_id (NULL = Chưa phân loại).
-- Xoá thư mục: nguồn bên trong về "Chưa phân loại", thư mục con bị xoá theo.

CREATE TABLE IF NOT EXISTS argon_folders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username   TEXT        NOT NULL,
  parent_id  UUID        REFERENCES argon_folders(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS argon_folders_uniq ON argon_folders (username, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
ALTER TABLE argon_folders ENABLE ROW LEVEL SECURITY;   -- chỉ service_role truy cập

ALTER TABLE argon_sources ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES argon_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_argon_sources_folder ON argon_sources (folder_id) WHERE folder_id IS NOT NULL;

-- Nhập từ cách tổ chức cũ: mỗi dự án thường đang có nguồn thành một thư mục gốc cùng tên, nguồn của dự án vào thư mục đó.
INSERT INTO argon_folders (username, name)
SELECT DISTINCT p.username, p.name
FROM argon_projects p
WHERE p.kind = 'project' AND p.name NOT LIKE '🌐%'
  AND EXISTS (SELECT 1 FROM argon_sources s WHERE s.project_id = p.id)
ON CONFLICT DO NOTHING;

UPDATE argon_sources s SET folder_id = f.id
FROM argon_projects p
JOIN argon_folders f ON f.username = p.username AND f.name = p.name AND f.parent_id IS NULL
WHERE s.project_id = p.id AND p.kind = 'project' AND s.folder_id IS NULL;

NOTIFY pgrst, 'reload schema';
