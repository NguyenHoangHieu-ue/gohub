-- Migration v3: Drop columns bot không dùng
-- Chạy trong Supabase SQL Editor

ALTER TABLE skus     DROP COLUMN IF EXISTS wr_group;
ALTER TABLE products DROP COLUMN IF EXISTS data_plan_type;
