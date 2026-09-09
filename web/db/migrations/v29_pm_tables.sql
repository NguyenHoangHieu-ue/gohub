-- v29: PM tables — pm_operators, pm_price_lists, sku_vat
-- Chạy trong Supabase SQL Editor

-- ─── pm_operators ─────────────────────────────────────────────────────────────
-- Source: PM API /api-pull/gohub-cloud/operators
-- Sync: cron /api/cron/sync-pm-data (hàng ngày 08:30 ICT)

CREATE TABLE IF NOT EXISTS pm_operators (
  code                TEXT        PRIMARY KEY,
  name                TEXT,
  description         TEXT,
  image_url           TEXT,
  country             TEXT,                  -- mã ISO (VN, JP, TH, ...)
  category_codes      JSONB,                 -- mảng mã category liên kết
  date_created        TIMESTAMPTZ,
  last_modified_date  TIMESTAMPTZ,
  synced_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_operators_country ON pm_operators (country);

-- ─── pm_price_lists ───────────────────────────────────────────────────────────
-- Source: PM API /api-pull/gohub-cloud/price-lists
-- type = ext (đối tác/external) hoặc itn (nội bộ/internal)

CREATE TABLE IF NOT EXISTS pm_price_lists (
  code                TEXT        PRIMARY KEY,  -- 3 ký tự (LV2, TV3, BSP, GHI, OPS, ...)
  type                TEXT,                      -- ext | itn
  tenant              TEXT,                      -- VN | US | null
  channel             TEXT,
  channel_code        TEXT,
  label               TEXT,                      -- tên hiển thị
  description         TEXT,
  listing_type        TEXT,
  sort_order          INTEGER,
  is_active           BOOLEAN     DEFAULT TRUE,
  date_created        TIMESTAMPTZ,
  last_modified_date  TIMESTAMPTZ,
  synced_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_price_lists_type   ON pm_price_lists (type);
CREATE INDEX IF NOT EXISTS idx_pm_price_lists_tenant ON pm_price_lists (tenant);

-- ─── sku_vat ──────────────────────────────────────────────────────────────────
-- Source: PM API /api-pull/gohub-cloud/sku-vat (chỉ tenant VN)
-- vat_status = Yes/No effective (Product Type D/E luôn No dù config khác)

CREATE TABLE IF NOT EXISTS sku_vat (
  sku_code            TEXT        PRIMARY KEY,
  vendor_code         TEXT,
  product_code        TEXT,
  product_type        TEXT,                      -- label hiển thị
  vat_status          TEXT        DEFAULT 'No',  -- Yes | No
  name_vn             TEXT,                      -- tên SP tiếng Việt
  vat_unit            TEXT,                      -- VND | USD
  vat_price           NUMERIC,                   -- giá VAT
  vat_tax_rate        TEXT,                      -- "8%" | "10%"
  synced_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sku_vat_status       ON sku_vat (vat_status);
CREATE INDEX IF NOT EXISTS idx_sku_vat_product_code ON sku_vat (product_code);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- service_role (server-side) được toàn quyền; anonymous không được đọc

ALTER TABLE pm_operators  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_vat        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON pm_operators   FOR ALL USING (true);
CREATE POLICY "service_role_all" ON pm_price_lists FOR ALL USING (true);
CREATE POLICY "service_role_all" ON sku_vat        FOR ALL USING (true);
