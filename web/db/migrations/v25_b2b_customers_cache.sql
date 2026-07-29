-- Migration v25: Bảng cache B2B customers từ gohub_dw → Supabase
-- Mục đích: Lưu danh sách KH B2B có dữ liệu để xem nhanh không cần query gohub_dw mỗi lần.
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS b2b_customers_cache (
  customer_code     TEXT PRIMARY KEY,
  customer_name     TEXT,
  price_list_name   TEXT,          -- phân khúc (Strategic/VIP/Silver/Gold)
  currency_code     TEXT,          -- VND / USD
  price_list_code   TEXT,
  status            TEXT,          -- Active / Inactive
  sales_pic_code    TEXT,          -- mã nhân viên phụ trách
  total_revenue     NUMERIC DEFAULT 0,
  total_gp          NUMERIC DEFAULT 0,
  total_orders      INTEGER DEFAULT 0,
  total_units       INTEGER DEFAULT 0,
  first_order_date  TEXT,
  last_order_date   TEXT,
  synced_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Index để query nhanh theo tier / currency
CREATE INDEX IF NOT EXISTS idx_b2b_cache_price_list ON b2b_customers_cache(price_list_name);
CREATE INDEX IF NOT EXISTS idx_b2b_cache_currency   ON b2b_customers_cache(currency_code);
CREATE INDEX IF NOT EXISTS idx_b2b_cache_revenue    ON b2b_customers_cache(total_revenue DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_cache_synced     ON b2b_customers_cache(synced_at);
