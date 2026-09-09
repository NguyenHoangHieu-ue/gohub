-- Migration v24: Thêm source_code vào analytics_channel_costs
-- Mục đích: Map chi phí kênh bằng dim_order_source.code (ổn định) thay vì channel_name (có thể đổi)
-- Chạy trong Supabase SQL Editor

-- 1. Thêm cột source_code
ALTER TABLE analytics_channel_costs
  ADD COLUMN IF NOT EXISTS source_code TEXT;

-- 2. Thêm index cho lookup nhanh
CREATE INDEX IF NOT EXISTS idx_acc_source_code_month
  ON analytics_channel_costs(source_code, month);

-- 3. Sau khi chạy migration, vào tab Settings → Cost Management và nhập lại chi phí
--    cho các kênh đã đổi tên — hệ thống sẽ tự lưu source_code mới.
--    Các record cũ (source_code NULL) vẫn được tra bằng tên kênh (backward compatible).
