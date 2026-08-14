-- v37: staff_targets — tách hk3_rev thành hk3_strategic + hk3_non_strategic
-- Chạy trong Supabase SQL Editor.

ALTER TABLE staff_targets
  ADD COLUMN IF NOT EXISTS hk3_strategic     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hk3_non_strategic NUMERIC DEFAULT 0;

-- Migrate data cũ: tất cả hk3_rev hiện tại → hk3_strategic
UPDATE staff_targets
SET hk3_strategic = COALESCE(hk3_rev, 0)
WHERE hk3_strategic = 0 AND hk3_rev > 0;
