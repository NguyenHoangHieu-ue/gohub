-- v30: Usage tracking for tab views + chatbot analytics (creator-only)
CREATE TABLE IF NOT EXISTS app_usage_events (
  id           BIGSERIAL PRIMARY KEY,
  event_type   TEXT        NOT NULL CHECK (event_type IN ('page_view','chat')),
  page_path    TEXT,
  tab_key      TEXT,
  user_email   TEXT,
  user_role    TEXT,
  -- chat-specific
  agent_id     TEXT,
  user_message TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_usage_events_time_idx  ON app_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS app_usage_events_type_idx  ON app_usage_events (event_type);
CREATE INDEX IF NOT EXISTS app_usage_events_email_idx ON app_usage_events (user_email);
