-- Migration v6b: Đổi embedding dimension 768 → 3072 (gemini-embedding-001)
-- Chạy trong Supabase SQL Editor (kb_chunks chưa có data nên safe)

DROP INDEX IF EXISTS idx_kb_chunks_embedding;

ALTER TABLE kb_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE kb_chunks ADD COLUMN embedding vector(3072);

CREATE INDEX idx_kb_chunks_embedding
  ON kb_chunks USING hnsw (embedding vector_cosine_ops);

-- Update search function
CREATE OR REPLACE FUNCTION search_kb(
  query_embedding vector(3072),
  match_count     int   DEFAULT 5,
  match_threshold float DEFAULT 0.5,
  filter_dept     text  DEFAULT NULL
)
RETURNS TABLE(
  chunk_id      bigint,
  document_id   uuid,
  document_name text,
  department    text,
  content       text,
  similarity    float
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.id           AS chunk_id,
    d.id           AS document_id,
    d.name         AS document_name,
    d.department,
    c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM kb_chunks c
  JOIN kb_documents d ON c.document_id = d.id
  WHERE
    (filter_dept IS NULL OR d.department = 'all' OR d.department = filter_dept)
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
