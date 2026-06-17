-- Migration: Thêm đầy đủ tỷ giá nội bộ Tháng 6/2026
-- Source: Bảng Tỷ Giá Ngoại Tệ Hàng Tháng (file nội bộ)
-- Chạy trong Supabase SQL Editor

INSERT INTO app_settings (key, value, label, category, updated_at)
VALUES
  -- ── Cập nhật 3 tỷ giá hiện có (T06/2026) ────────────────────────────────
  -- Lưu ý: hkd_usd và twd_usd lưu dạng nghịch đảo (USD per 1 HKD/TWD)
  -- vì code dùng: usd = cogs * hkd_usd
  ('fx.usd_vnd',  '26394',    'VND / USD',         'fx_rate', now()),
  ('fx.hkd_usd',  '0.12824',  'USD / HKD',         'fx_rate', now()),  -- 1 / 7.798
  ('fx.twd_usd',  '0.031797', 'USD / TWD',         'fx_rate', now()),  -- 1 / 31.452

  -- ── Gohub JSC — tỷ giá VND (T06/2026) ──────────────────────────────────
  ('fx.vnd_cny',  '3970',     'VND / CNY (JSC)',   'fx_rate', now()),
  ('fx.vnd_gbp',  '35957',    'VND / GBP (JSC)',   'fx_rate', now()),

  -- ── Gohub Inc — 1 USD = X đơn vị ngoại tệ (T06/2026) ──────────────────
  -- Lưu theo format file: 1 USD = X (số nguyên gốc từ bảng tỷ giá)
  ('fx.usd_jpy',  '158.916',  'JPY / USD',         'fx_rate', now()),
  ('fx.usd_thb',  '32.204',   'THB / USD',         'fx_rate', now()),
  ('fx.usd_cny',  '6.727',    'CNY / USD (Inc)',   'fx_rate', now()),
  ('fx.usd_eur',  '0.855',    'EUR / USD',         'fx_rate', now()),
  ('fx.usd_gbp',  '0.739',    'GBP / USD (Inc)',   'fx_rate', now()),
  ('fx.usd_sgd',  '1.272',    'SGD / USD',         'fx_rate', now())

ON CONFLICT (key) DO UPDATE SET
  value      = EXCLUDED.value,
  label      = EXCLUDED.label,
  updated_at = now();
