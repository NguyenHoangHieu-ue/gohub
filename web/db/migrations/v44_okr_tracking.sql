-- v44: chuẩn hoá OKR tracking (tab My Metrics) — table cũ okr_evidence_records được tạo
-- tay ngoài Supabase từ trước (không có migration), nay ghi lại schema + bổ sung audit trail
-- + thêm bảng okr_sku_tags cho "SKU GM tối ưu" tính bằng dữ liệu thật gohub_dw thay vì tự khai.

-- 1. okr_evidence_records (SLA / Vendor Speed — evidence tự nhập, có ảnh chứng minh)
CREATE TABLE IF NOT EXISTS okr_evidence_records (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter                TEXT        NOT NULL,   -- "Q3-2026"
  metric                 TEXT        NOT NULL,   -- 'sla' | 'vendor_speed'
  title                  TEXT,
  request_time           TIMESTAMPTZ NOT NULL,
  request_note           TEXT,
  request_image_url      TEXT,
  completion_time        TIMESTAMPTZ,
  completion_note        TEXT,
  completion_image_url   TEXT,
  duration_value         NUMERIC,
  created_by             TEXT        NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit trail — trước đây record sửa được không để lại dấu vết, sếp không có cách biết có bị sửa sau không.
ALTER TABLE okr_evidence_records ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE okr_evidence_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_okr_evidence_quarter_metric ON okr_evidence_records (quarter, metric);

-- 2. okr_sku_tags — SKU được đánh dấu "đã tối ưu giá/margin trong quý".
-- Chỉ lưu SKU + ngày áp dụng + ghi chú/ảnh rate sheet. Số liệu margin trước/sau KHÔNG nhập tay —
-- API tự tính từ đơn hàng THẬT trong gohub_dw (fact_fulfillment_revenue) trước/sau effective_date
-- → không thể tự khai khống, sếp verify được bằng cách tự query lại.
CREATE TABLE IF NOT EXISTS okr_sku_tags (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter           TEXT        NOT NULL,   -- "Q3-2026"
  sku_code          TEXT        NOT NULL,
  note              TEXT,                   -- vd "Renegotiate WM rate", "SKU mới thay thế NCC rẻ hơn"
  effective_date    DATE        NOT NULL,   -- ngày áp dụng giá mới / ngày SKU lên hệ thống
  evidence_image_url TEXT,                  -- ảnh rate sheet / bằng chứng đàm phán
  created_by        TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        TEXT,
  updated_at        TIMESTAMPTZ,
  UNIQUE (quarter, sku_code)
);

CREATE INDEX IF NOT EXISTS idx_okr_sku_tags_quarter ON okr_sku_tags (quarter);
