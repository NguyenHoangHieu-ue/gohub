-- v39: thêm target_3hk_rev vào b2b_customer_targets
-- Target 3HK Revenue nhập tay trực tiếp (nếu 0 → fallback = target_rev × target_3hk_pct)

ALTER TABLE b2b_customer_targets
  ADD COLUMN IF NOT EXISTS target_3hk_rev BIGINT DEFAULT 0;
