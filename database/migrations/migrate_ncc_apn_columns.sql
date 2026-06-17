-- Thêm các cột APN info vào ncc_products
-- Chạy trong Supabase SQL Editor

ALTER TABLE ncc_products
  ADD COLUMN IF NOT EXISTS apn                  TEXT,
  ADD COLUMN IF NOT EXISTS apn_network_type     TEXT,
  ADD COLUMN IF NOT EXISTS apn_roaming_carrier  TEXT,
  ADD COLUMN IF NOT EXISTS apn_coverage_area    TEXT,
  ADD COLUMN IF NOT EXISTS apn_notification     TEXT,
  ADD COLUMN IF NOT EXISTS apn_data_reset       TEXT,
  ADD COLUMN IF NOT EXISTS apn_telecom_providers TEXT,
  ADD COLUMN IF NOT EXISTS apn_prepaid_card     TEXT;
