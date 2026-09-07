-- v50: hàng đợi lệnh cho Extension điều khiển browser cá nhân Hiếu (Gấu Pro Phase 2, s195+1)
-- Gấu Pro (server) INSERT lệnh, extension (máy Hiếu) poll GET /bridge/next để lấy + thực thi, rồi
-- POST /bridge/result để ghi kết quả. requires_confirm do SERVER set cứng theo action, KHÔNG cho model
-- truyền vào — tránh Gemini "lách" bỏ qua bước Hiếu duyệt thao tác click/fill/navigate.
CREATE TABLE IF NOT EXISTS browser_bridge_commands (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  status          TEXT        NOT NULL DEFAULT 'pending', -- pending | claimed | done | error | expired
  action          TEXT        NOT NULL,                   -- list_tabs | read_tab | click | fill | navigate | scroll
  payload         JSONB,
  result          JSONB,
  error           TEXT,
  requires_confirm BOOLEAN    NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  claimed_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '60 seconds'
);

CREATE INDEX IF NOT EXISTS idx_browser_bridge_status ON browser_bridge_commands (status);

ALTER TABLE browser_bridge_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON browser_bridge_commands FOR ALL USING (true);
