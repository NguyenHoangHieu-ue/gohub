-- Migration v5b: Thêm ngày bắt đầu/kết thúc khuyến mãi vào products
-- Chạy trong Supabase SQL Editor

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS telco_perks_start DATE,
  ADD COLUMN IF NOT EXISTS telco_perks_end   DATE;

CREATE INDEX IF NOT EXISTS idx_products_telco_perks_start ON products(telco_perks_start);
