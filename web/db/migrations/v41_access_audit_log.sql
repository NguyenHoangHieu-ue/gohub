-- v41: audit log cho các thao tác cấp / thu hồi quyền access
CREATE TABLE IF NOT EXISTS access_audit_log (
  id             BIGSERIAL PRIMARY KEY,
  action         TEXT        NOT NULL,  -- 'add' | 'remove'
  target_type    TEXT        NOT NULL,  -- 'gp_access' | 'my_metrics_access'
  target_username TEXT       NOT NULL,
  performed_by   TEXT        NOT NULL,
  performed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_access_audit_log_at ON access_audit_log (performed_at DESC);
