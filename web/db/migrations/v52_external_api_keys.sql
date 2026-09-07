-- v52: API key riêng cho từng bên nhận tích hợp bên ngoài (server-to-server, vd manager's tool đọc
-- catalog sản phẩm/SKU + COGS). Lưu HASH (sha256), không lưu plaintext — khác token bridge cá nhân
-- (app_settings), đây là credential giao cho hệ thống BÊN NGOÀI công ty, giá trị rủi ro cao hơn.
CREATE TABLE IF NOT EXISTS external_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_external_api_keys_hash ON external_api_keys (key_hash);

ALTER TABLE external_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON external_api_keys FOR ALL USING (true);
