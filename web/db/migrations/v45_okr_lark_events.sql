-- v45: My Metrics rebuild — Lark auto-detected SLA/Vendor Speed events (review queue) +
-- loosen okr_sku_tags so it can be used as an OPTIONAL annotation on the new company-wide
-- SKU auto-scan (sku-scan API) instead of being the only source of the "SKU Gross Margin" number.

-- 1. okr_lark_events — Bé Gấu (Gemini) quét 1 group Lark, tự đề xuất cặp request/completion cho
-- SLA (Product Request Handling) và Vendor Selection Speed. KHÔNG tự động tính vào KPI ngay —
-- Hiếu phải Xác nhận/Từ chối (status) trước khi tính vào TB, để tránh AI đoán sai làm lệch số
-- báo cáo hiệu suất thật. Dedupe theo message_id gốc của thread (ổn định hơn thread_id, luôn có).
CREATE TABLE IF NOT EXISTS okr_lark_events (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter            TEXT        NOT NULL,   -- "Q3-2026"
  metric             TEXT        NOT NULL,   -- 'sla' | 'vendor_speed'
  chat_id            TEXT        NOT NULL,
  thread_id          TEXT,
  message_id         TEXT        NOT NULL,
  request_time       TIMESTAMPTZ NOT NULL,
  request_snippet    TEXT,
  request_sender     TEXT,
  completion_time    TIMESTAMPTZ,
  completion_snippet TEXT,
  completion_sender  TEXT,
  duration_value     NUMERIC,
  ai_reason          TEXT,
  status             TEXT        NOT NULL DEFAULT 'pending_review',  -- pending_review | confirmed | rejected
  reviewed_by        TEXT,
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, metric)
);

CREATE INDEX IF NOT EXISTS idx_okr_lark_events_quarter_status ON okr_lark_events (quarter, status);

-- 2. okr_sku_tags — trước bắt buộc effective_date để tự so margin trước/sau (nay việc đó do
-- sku-scan API làm cho TOÀN BỘ SKU tự động, không cần tag tay nữa). Cột này giờ dùng làm ghi chú
-- tuỳ chọn gắn vào 1 dòng trong bảng auto-scan → không còn bắt buộc.
ALTER TABLE okr_sku_tags ALTER COLUMN effective_date DROP NOT NULL;
