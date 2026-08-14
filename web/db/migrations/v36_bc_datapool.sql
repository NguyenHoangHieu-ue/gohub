-- v36: BC Datapool integration — sync catalog, prices, balance, countries từ BC API
-- Chạy trong Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS bc_countries (
  mcc          TEXT PRIMARY KEY,
  continent    TEXT,
  name         TEXT NOT NULL,
  url          TEXT,
  synced_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_products (
  sku_id              TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL,
  days                TEXT,
  capacity_kb         TEXT,
  high_flow_size_kb   TEXT,
  limit_flow_speed    TEXT,
  hotspot_support     TEXT,
  plan_type           TEXT,
  validity_period     TEXT,
  description         TEXT,
  countries           JSONB,
  full_data           JSONB,
  synced_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_prices (
  sku_id            TEXT NOT NULL,
  copies            TEXT NOT NULL,
  retail_price      NUMERIC,
  settlement_price  NUMERIC,
  synced_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (sku_id, copies)
);

CREATE TABLE IF NOT EXISTS bc_balance_log (
  id          BIGSERIAL PRIMARY KEY,
  balance     NUMERIC NOT NULL,
  synced_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bc_sync_log (
  id          BIGSERIAL PRIMARY KEY,
  changes     JSONB,
  error       TEXT,
  synced_at   TIMESTAMPTZ DEFAULT NOW()
);
