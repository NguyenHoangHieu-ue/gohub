-- v10_notifications.sql
-- Bảng thông báo hệ thống: sync SKU changes, KB/wiki actions

CREATE TABLE IF NOT EXISTS notifications (
  id           BIGSERIAL    PRIMARY KEY,
  type         TEXT         NOT NULL,                    -- sync | kb_doc | wiki | price_change
  title        TEXT         NOT NULL,
  body         TEXT,
  data         JSONB        DEFAULT '{}',               -- { changes[], summary{} }
  visibility   TEXT         NOT NULL DEFAULT 'all',     -- all | admin_manager
  sent_to_lark BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_created_at   ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_lark_pending ON notifications (sent_to_lark, visibility)
  WHERE sent_to_lark = false;
