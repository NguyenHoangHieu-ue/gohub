-- v51: Bridge multi-tenant — mỗi user (đã có quyền Gấu Pro) tự pair browser CỦA CHÍNH HỌ, thay vì 1 token
-- global = 1 browser (Hiếu) như v50. Bảng browser_bridge_commands giữ nguyên, chỉ thêm owner_username để
-- biết lệnh thuộc hàng đợi của ai.
CREATE TABLE IF NOT EXISTS browser_bridge_pairings (
  username   TEXT        PRIMARY KEY,
  token      TEXT        NOT NULL UNIQUE,
  last_seen  TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE browser_bridge_commands ADD COLUMN IF NOT EXISTS owner_username TEXT;
CREATE INDEX IF NOT EXISTS idx_browser_bridge_owner_status ON browser_bridge_commands (owner_username, status);

-- Best-effort giữ token Hiếu (creator) đã pair từ trước — khỏi phải re-pair. Không khớp thì không sao,
-- tự tạo token mới 1 lần trên trang Bridge.
INSERT INTO browser_bridge_pairings (username, token)
SELECT u.username, s.value FROM app_settings s
JOIN users u ON u.role = 'creator'
WHERE s.key = 'browser_bridge_token'
ON CONFLICT (username) DO NOTHING;

ALTER TABLE browser_bridge_pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON browser_bridge_pairings FOR ALL USING (true);
