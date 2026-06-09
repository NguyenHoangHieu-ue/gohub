-- ============================================================
-- Migration: thêm cột exist cho ncc_worldmove
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- 1. Thêm cột exist
ALTER TABLE ncc_worldmove
  ADD COLUMN IF NOT EXISTS exist TEXT DEFAULT 'No';

-- 2. Populate lần đầu dựa trên skus hiện tại
--    (sau đó sync.py sẽ tự cập nhật mỗi ngày)
UPDATE ncc_worldmove wm
SET exist = CASE
  WHEN EXISTS (
    SELECT 1 FROM skus s
    WHERE s.vendor_sku = wm.vendor_product_id
    AND s.status = 'Active'
  ) THEN 'Yes'
  ELSE 'No'
END;

-- Kiểm tra kết quả
SELECT exist, COUNT(*) AS count
FROM ncc_worldmove
GROUP BY exist
ORDER BY exist;
