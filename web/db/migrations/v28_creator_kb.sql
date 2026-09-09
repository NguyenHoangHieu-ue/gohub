-- v28: Creator Knowledge Base
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS creator_kb (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  key         TEXT        UNIQUE NOT NULL,           -- slug định danh, vd: "fx_usd_vnd"
  category    TEXT        NOT NULL DEFAULT 'notes',  -- product_codes | sku_rules | exchange_rates | cogs | vendors | processes | notes
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,                  -- markdown
  metadata    JSONB,                                 -- structured data tuỳ chọn
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index để query theo category nhanh
CREATE INDEX IF NOT EXISTS idx_creator_kb_category ON creator_kb (category);

-- Seed: Master Note mặc định
INSERT INTO creator_kb (key, category, title, content) VALUES (
  '_master_note',
  '_system',
  'Master Note',
  '# GoHub Creator Knowledge Base\n\n*Chưa có nội dung. Hãy thêm entries và Gấu Pro sẽ tự tổng hợp.*'
) ON CONFLICT (key) DO NOTHING;

-- RLS: chỉ service_role (server-side) được truy cập
ALTER TABLE creator_kb ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creator_kb FOR ALL USING (true);
