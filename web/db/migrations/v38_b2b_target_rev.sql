-- v38: thêm target_rev vào b2b_customer_targets
-- Target Revenue per-KH per-quý, dùng để tính Target 3HK Revenue = target_rev × target_3hk_pct

ALTER TABLE b2b_customer_targets
  ADD COLUMN IF NOT EXISTS target_rev BIGINT DEFAULT 0;
