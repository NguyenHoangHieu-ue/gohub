-- v13: Analytics tables — migrated from gohub-intel Turso/SQLite
-- Chạy trong Supabase SQL Editor

-- ── Channel costs (marketing spend per channel per month) ─────────────────────
CREATE TABLE IF NOT EXISTS analytics_channel_costs (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel      TEXT NOT NULL,
  month        TEXT NOT NULL,            -- format: YYYY-MM
  ads          TEXT,
  platform_fee TEXT,
  sponsor_products TEXT,
  media        TEXT,
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_channel_costs_channel_month
  ON analytics_channel_costs(channel, month);

-- ── Channel group costs (grouped operating costs) ────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_channel_group_costs (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_name TEXT NOT NULL,
  month      TEXT NOT NULL,
  item_name  TEXT,
  amount     NUMERIC,
  note       TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Target planning (monthly KPI targets per channel) ────────────────────────
CREATE TABLE IF NOT EXISTS analytics_target_planning (
  id                        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  month                     TEXT NOT NULL,
  channel                   TEXT NOT NULL,
  target_revenue            NUMERIC,
  target_3hk_contribution   NUMERIC,
  target_unit               NUMERIC,
  note                      TEXT,
  updated_by                TEXT,
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_target_planning_month_channel
  ON analytics_target_planning(month, channel);

-- ── Cost input settings (mode per channel per month) ─────────────────────────
CREATE TABLE IF NOT EXISTS analytics_cost_input_settings (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  channel    TEXT NOT NULL,
  month      TEXT NOT NULL,
  mode       TEXT,                       -- "group" | "individual"
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_cost_settings_channel_month
  ON analytics_cost_input_settings(channel, month);

-- ── Report cache (replaces Turso report_cache) ───────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_report_cache (
  key        TEXT PRIMARY KEY,
  data       TEXT,                       -- JSON string
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── App config for analytics (replaces Turso app_config) ────────────────────
-- Dùng app_settings table hiện có (category = 'analytics')
-- Các key: partner_tiers, role_permissions, sku_destination_rule, gemini_key_analytics

-- ── Scheduled messages ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_scheduled_messages (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT,
  cron_expr   TEXT NOT NULL,             -- cron expression e.g. "0 9 * * 1"
  message     TEXT NOT NULL,
  chat_id     TEXT,                      -- Lark chat_id
  is_active   BOOLEAN DEFAULT true,
  last_run    TIMESTAMPTZ,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Feedbacks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_feedbacks (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_email  TEXT,
  user_name   TEXT,
  category    TEXT,
  message     TEXT NOT NULL,
  status      TEXT DEFAULT 'open',       -- open | resolved | closed
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Conversations (AI BI analyst) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_conversations (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL,             -- username from NextAuth
  title       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytics_messages (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id TEXT NOT NULL REFERENCES analytics_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,         -- 'user' | 'assistant'
  content         TEXT NOT NULL,
  chart_data      TEXT,                  -- JSON for embedded charts
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_messages_conv
  ON analytics_messages(conversation_id);
