-- v14: Lark CS Ticket table (replaces Turso lark_tickets)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS lark_cs_tickets (
  lark_record_id    TEXT PRIMARY KEY,
  ticket_no         TEXT,
  order_no          TEXT,
  sku               TEXT,
  ticket_type       TEXT,
  issue_detail      TEXT,
  details           TEXT,
  source            TEXT,
  channel           TEXT,
  vendor            TEXT,
  handler           TEXT,
  product_action    TEXT,
  money_action      TEXT,
  creation_date     BIGINT,       -- Unix ms timestamp (same as Turso schema)
  ticket_status     TEXT,
  leadtime_minutes  NUMERIC,
  source_1          TEXT,         -- Channel group (B2B / B2C)
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lark_cs_tickets_creation_date ON lark_cs_tickets(creation_date);
CREATE INDEX IF NOT EXISTS idx_lark_cs_tickets_sku ON lark_cs_tickets(sku);
CREATE INDEX IF NOT EXISTS idx_lark_cs_tickets_source_1 ON lark_cs_tickets(source_1);
CREATE INDEX IF NOT EXISTS idx_lark_cs_tickets_ticket_type ON lark_cs_tickets(ticket_type);
