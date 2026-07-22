-- Migration v21 Turso: chi phí kênh nhập tay cho từng khách hàng B2B theo tháng.
-- Dùng bởi Quarter Report › Chi tiết B2B (nút "Sửa chi tiết" + modal dòng chi phí).
-- CM1 khách hàng = Gross Margin − Σ(cost). cost_lines JSON.
-- Chạy trong Turso (gohub-intel-baole). SQLite syntax — REAL thay DOUBLE PRECISION, TEXT thay TIMESTAMPTZ.

CREATE TABLE IF NOT EXISTS b2b_customer_cost_monthly (
  id            TEXT PRIMARY KEY,                 -- "{month}_{customer_code}"
  month         TEXT NOT NULL,                    -- "YYYY-MM"
  customer_code TEXT NOT NULL,
  cost_type     TEXT DEFAULT 'amount',            -- 'amount' | 'percent' (fallback khi cost_lines rỗng)
  cost_value    REAL DEFAULT 0,                   -- giá trị gộp (tương ứng cost_type)
  cost_lines    TEXT DEFAULT '[]',                -- JSON string: [{label, type:'amount'|'percent', value}]
  updated_by    TEXT,
  updated_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_b2b_cost_month ON b2b_customer_cost_monthly (month);
CREATE INDEX IF NOT EXISTS idx_b2b_cost_code  ON b2b_customer_cost_monthly (customer_code);
