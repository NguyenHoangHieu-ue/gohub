-- v15: Scheduled Lark Messages (replaces Turso scheduled_messages)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS lark_scheduled_messages (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT NOT NULL,
  prompt          TEXT NOT NULL,             -- Gemini prompt to generate message
  cron_expression TEXT NOT NULL,             -- cron e.g. "0 9 * * 1" (UTC)
  lark_webhook_url TEXT,                     -- optional webhook; nếu null dùng lark_notify_chat_id
  lark_keyword    TEXT,                      -- optional keyword prefix
  is_active       BOOLEAN DEFAULT true,
  last_run_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      TEXT
);
