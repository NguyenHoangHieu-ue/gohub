-- Migration v7: Wiki pages nội bộ
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS kb_wiki_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  page_type   TEXT NOT NULL DEFAULT 'note',
  -- vendor_profile | product_guide | process_sop | pricing_rule | meeting_note | reference | note
  department  TEXT NOT NULL DEFAULT 'all',
  tags        TEXT[] DEFAULT '{}',
  embedding   vector(3072),
  version     INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT NOT NULL,
  updated_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_department ON kb_wiki_pages(department);
CREATE INDEX IF NOT EXISTS idx_wiki_type       ON kb_wiki_pages(page_type);
CREATE INDEX IF NOT EXISTS idx_wiki_updated    ON kb_wiki_pages(updated_at DESC);

CREATE TABLE IF NOT EXISTS kb_wiki_versions (
  id         BIGSERIAL PRIMARY KEY,
  page_id    UUID NOT NULL REFERENCES kb_wiki_pages(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  version    INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_versions_page ON kb_wiki_versions(page_id, version DESC);

-- Semantic search trong wiki pages
CREATE OR REPLACE FUNCTION search_wiki(
  query_embedding vector(3072),
  match_count     int   DEFAULT 5,
  match_threshold float DEFAULT 0.4,
  filter_dept     text  DEFAULT NULL
)
RETURNS TABLE(
  page_id    uuid,
  title      text,
  page_type  text,
  department text,
  content    text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id            AS page_id,
    title,
    page_type,
    department,
    LEFT(content, 600) AS content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM kb_wiki_pages
  WHERE
    embedding IS NOT NULL
    AND (filter_dept IS NULL OR department = 'all' OR department = filter_dept)
    AND 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
