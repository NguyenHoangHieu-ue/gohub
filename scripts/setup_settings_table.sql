-- Create app_settings table
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT        NOT NULL,
  label      TEXT        NOT NULL DEFAULT '',
  category   TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (only service role / admin should access via API)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default; deny public access
CREATE POLICY "deny_public" ON app_settings
  FOR ALL
  TO anon
  USING (false);

-- Insert initial values (upsert so it is safe to re-run)
INSERT INTO app_settings (key, value, label, category, updated_at)
VALUES
  -- Exchange Rates
  ('fx.usd_vnd',  '26394',   'VND / USD',                           'fx_rate',  now()),
  ('fx.hkd_usd',  '0.12824', 'USD / HKD',                           'fx_rate',  now()),
  ('fx.twd_usd',  '0.03165', 'USD / TWD',                           'fx_rate',  now()),

  -- 3HK Datapool Formulas
  ('3hk.fixed_factor',          '0.55', 'Fixed package usage factor',           'formula', now()),
  ('3hk.daily_factor',          '0.40', 'Daily package usage factor',            'formula', now()),
  ('3hk.unlim_10mbps_gb_day',   '1.8',  'Unlimited 10Mbps — GB/day assumed',    'formula', now()),
  ('3hk.unlim_5mbps_gb_day',    '1.6',  'Unlimited 5Mbps — GB/day assumed',     'formula', now())
ON CONFLICT (key) DO NOTHING;
