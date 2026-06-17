-- Migration v4: Thêm cột còn thiếu vào sku_catalog
-- Chạy trong Supabase SQL Editor

ALTER TABLE sku_catalog
  ADD COLUMN IF NOT EXISTS is_daily     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expirations  TEXT;   -- số ngày SIM còn hiệu lực sau kích hoạt

-- Index mới
CREATE INDEX IF NOT EXISTS idx_sku_catalog_is_daily     ON sku_catalog(is_daily);
CREATE INDEX IF NOT EXISTS idx_sku_catalog_country_group ON sku_catalog(country_group);
