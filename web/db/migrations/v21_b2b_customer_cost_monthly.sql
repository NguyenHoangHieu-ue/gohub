-- Migration v21: chi phí kênh nhập tay cho từng khách hàng B2B theo tháng.
-- Dùng bởi Quarter Report › Chi tiết B2B (nút "Sửa chi tiết" + modal dòng chi phí).
-- CM1 khách hàng = Gross Margin − Σ(cost). cost_lines = [{label,type:'amount'|'percent',value}].
-- Chạy trong Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS b2b_customer_cost_monthly (
  id            TEXT PRIMARY KEY,                 -- "{month}_{customer_code}"
  month         TEXT NOT NULL,                    -- "YYYY-MM"
  customer_code TEXT NOT NULL,
  cost_type     TEXT DEFAULT 'amount',            -- 'amount' | 'percent' (fallback khi cost_lines rỗng)
  cost_value    DOUBLE PRECISION DEFAULT 0,       -- giá trị gộp (tương ứng cost_type)
  cost_lines    JSONB DEFAULT '[]'::jsonb,        -- [{label, type:'amount'|'percent', value}]
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_cost_month ON b2b_customer_cost_monthly (month);
CREATE INDEX IF NOT EXISTS idx_b2b_cost_code  ON b2b_customer_cost_monthly (customer_code);
