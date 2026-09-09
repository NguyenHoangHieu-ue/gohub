-- v18: Bảng snapshot metrics tháng (Revenue/GP/CM1/3HK) để chatbot query trực tiếp
-- Cron refresh-monthly-kpis chạy hàng ngày để cập nhật

CREATE TABLE IF NOT EXISTS analytics_monthly_kpis (
  id           SERIAL PRIMARY KEY,
  month        VARCHAR(7)  NOT NULL,              -- 'YYYY-MM'
  company_code VARCHAR(10) NOT NULL DEFAULT 'ALL',
  revenue      BIGINT,
  gross_margin BIGINT,
  op_cost      BIGINT,
  cm1          BIGINT,
  cm1_pct      DECIMAL(6,2),
  hk3_revenue  BIGINT,
  hk3_pct      DECIMAL(6,2),
  refreshed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (month, company_code)
);

-- Index để chatbot query nhanh theo tháng
CREATE INDEX IF NOT EXISTS idx_analytics_monthly_kpis_month ON analytics_monthly_kpis (month DESC);

-- RLS: cho phép service role read/write, authenticated read
ALTER TABLE analytics_monthly_kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service read/write" ON analytics_monthly_kpis FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated read" ON analytics_monthly_kpis FOR SELECT TO authenticated USING (true);
