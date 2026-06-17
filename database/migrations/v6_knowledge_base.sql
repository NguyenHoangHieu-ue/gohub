-- Migration v6: Knowledge Base (Kiến Thức Nội Bộ)
-- Chạy trong Supabase SQL Editor

-- pgvector extension (thường đã có trong Supabase)
CREATE EXTENSION IF NOT EXISTS vector;

-- Bảng lưu tài liệu
CREATE TABLE IF NOT EXISTS kb_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  file_type    TEXT NOT NULL,     -- pdf, docx, md, txt
  department   TEXT DEFAULT 'all', -- all, sales, product, tech, finance
  chunk_count  INTEGER DEFAULT 0,
  uploaded_by  TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_documents_dept       ON kb_documents(department);
CREATE INDEX IF NOT EXISTS idx_kb_documents_uploaded_by ON kb_documents(uploaded_by);

-- Bảng lưu chunks + embeddings
CREATE TABLE IF NOT EXISTS kb_chunks (
  id           BIGSERIAL PRIMARY KEY,
  document_id  UUID NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  embedding    vector(768),   -- text-embedding-004: 768 dims
  chunk_index  INTEGER NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_document ON kb_chunks(document_id);

-- HNSW index cho vector similarity search
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding
  ON kb_chunks USING hnsw (embedding vector_cosine_ops);

-- Hàm search KB (semantic)
CREATE OR REPLACE FUNCTION search_kb(
  query_embedding vector(768),
  match_count     int     DEFAULT 5,
  match_threshold float   DEFAULT 0.5,
  filter_dept     text    DEFAULT NULL
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
