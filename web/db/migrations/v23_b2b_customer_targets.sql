-- Migration v23: Target CM1 và 3HK% theo từng khách hàng B2B, theo quý.
-- Chạy trong Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS b2b_customer_targets (
  id            TEXT PRIMARY KEY,             -- "{Q}-{year}_{customer_code}" vd "Q3-2026_KH001"
  quarter       TEXT    NOT NULL,             -- "Q3"
  year          INTEGER NOT NULL,             -- 2026
  customer_code TEXT    NOT NULL,
  target_cm1    DOUBLE PRECISION DEFAULT 0,  -- Target CM1 tuyệt đối (VND)
  target_3hk_pct DOUBLE PRECISION DEFAULT 0, -- Target 3HK% (phần trăm, vd 70.0)
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_cust_targets_quarter ON b2b_customer_targets (quarter, year);
CREATE INDEX IF NOT EXISTS idx_b2b_cust_targets_code    ON b2b_customer_targets (customer_code);
