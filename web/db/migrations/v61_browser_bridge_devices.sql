-- v61: Bridge — lưu thông tin thiết bị của từng extension đã pair (truy vết khi có sự cố).
-- Mỗi máy/profile Chrome cài extension sinh 1 device_id cố định (chrome.storage.local); server ghi thêm IP.
-- Mỗi lệnh được extension nhận (claim) gắn device_id + IP của máy nhận → biết CHÍNH XÁC máy nào chạy lệnh nào.
CREATE TABLE IF NOT EXISTS browser_bridge_devices (
  id              BIGSERIAL   PRIMARY KEY,
  username        TEXT        NOT NULL,
  device_id       TEXT        NOT NULL,
  os              TEXT,
  arch            TEXT,
  user_agent      TEXT,
  browser_version TEXT,
  ext_version     TEXT,
  timezone        TEXT,
  language        TEXT,
  cpu_cores       INT,
  memory_gb       NUMERIC,
  chrome_email    TEXT,
  first_ip        TEXT,
  last_ip         TEXT,
  first_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen       TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked         BOOLEAN     NOT NULL DEFAULT false,
  UNIQUE (username, device_id)
);
CREATE INDEX IF NOT EXISTS idx_bridge_devices_last_seen ON browser_bridge_devices (last_seen DESC);

ALTER TABLE browser_bridge_commands ADD COLUMN IF NOT EXISTS device_id  TEXT;
ALTER TABLE browser_bridge_commands ADD COLUMN IF NOT EXISTS claimed_ip TEXT;
CREATE INDEX IF NOT EXISTS idx_bridge_commands_created ON browser_bridge_commands (created_at DESC);

ALTER TABLE browser_bridge_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON browser_bridge_devices FOR ALL USING (true);

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
