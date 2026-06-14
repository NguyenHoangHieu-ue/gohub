-- v12: MRP processing jobs
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS kb_processing_jobs (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id   UUID        NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  document_name TEXT,
  status        TEXT        NOT NULL DEFAULT 'analyzing'
                            CHECK (status IN ('analyzing','plan_ready','approved','rejected','done','error')),
  plan_json     JSONB,
  result_json   JSONB,
  error_text    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_jobs_document ON kb_processing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_kb_jobs_status   ON kb_processing_jobs(status);
