-- v33: Thêm vector embedding vào creator_kb để hỗ trợ semantic search
-- Yêu cầu: pgvector extension đã được enable trên Supabase (mặc định có).
-- Chạy trong Supabase SQL Editor.

-- 1. Thêm cột embedding (768 dim — khớp text-embedding-004 của Google)
ALTER TABLE creator_kb ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 2. Index HNSW cho similarity search nhanh (thay ivfflat vì KB nhỏ, HNSW ổn hơn)
CREATE INDEX IF NOT EXISTS creator_kb_embedding_hnsw
  ON creator_kb USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 3. RPC function để semantic search từ Next.js
CREATE OR REPLACE FUNCTION search_creator_kb(
  query_embedding vector(768),
  match_count     int DEFAULT 5
)
RETURNS TABLE(
  key        text,
  category   text,
  title      text,
  content    text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    key,
    category,
    title,
    content,
    1 - (embedding <=> query_embedding) AS similarity
  FROM creator_kb
  WHERE
    embedding IS NOT NULL
    AND category != '_system'
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
