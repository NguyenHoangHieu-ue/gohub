-- v9_wiki_hidden.sql
-- Thêm cột is_hidden để admin có thể ẩn wiki page khỏi user thường

ALTER TABLE kb_wiki_pages
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Index để query nhanh các page không bị ẩn
CREATE INDEX IF NOT EXISTS idx_wiki_pages_hidden ON kb_wiki_pages (is_hidden);
