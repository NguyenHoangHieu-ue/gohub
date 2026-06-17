-- ============================================================
-- Migration v2: Comprehensive schema — GoHub PM System
-- Chạy trong Supabase SQL Editor
-- ============================================================

-- ── 1. Dọn dẹp skus: bỏ cột giá cũ (giữ latest_cogs + wr_group tạm) ─────────

ALTER TABLE skus DROP COLUMN IF EXISTS original_cost;
ALTER TABLE skus DROP COLUMN IF EXISTS reference_cost_vnd;
ALTER TABLE skus DROP COLUMN IF EXISTS final_cogs_included_vat_vnd;
ALTER TABLE skus DROP COLUMN IF EXISTS final_cogs_usd;
-- wr_group: giữ tạm, chờ xác nhận ý nghĩa
-- currency: giữ tạm (có thể khác latest_cogs_currency)

-- ── 2. Thêm cột geo hierarchy vào ref_countries ───────────────────────────────

ALTER TABLE ref_countries
  ADD COLUMN IF NOT EXISTS continent  TEXT,
  ADD COLUMN IF NOT EXISTS sub_region TEXT,
  ADD COLUMN IF NOT EXISTS phone_code TEXT;   -- để trống, fill sau nếu cần

-- ── 3. Bảng ref_categories (category_code từ listings/items) ─────────────────
-- category_code = mã nước hiển thị trên web (B2C/Wholesale)
-- Link: ref_categories.iso_code → ref_countries.code

CREATE TABLE IF NOT EXISTS ref_categories (
    category_code  TEXT PRIMARY KEY,   -- ví dụ: JP, TH, VNM, HK...
    name_en        TEXT,
    name_vn        TEXT,
    iso_code       TEXT,               -- FK soft → ref_countries.code (2-char ISO)
    region_type    TEXT DEFAULT 'country',  -- 'country' | 'multi_country' | 'global'
    notes          TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Bảng ncc_vendor_config: catalog các NCC hiện có ───────────────────────
-- Để mở rộng NCC sau này không cần sửa code

CREATE TABLE IF NOT EXISTS ncc_vendor_config (
    ncc_code         TEXT PRIMARY KEY,   -- WM, 3H, BC, SS, VT, TM...
    ncc_name         TEXT NOT NULL,
    file_table       TEXT,               -- bảng Supabase lưu data: ncc_worldmove, ncc_3hk...
    data_type        TEXT DEFAULT 'products',  -- 'products' | 'zones' | 'pricing'
    price_currency   TEXT,               -- USD, HKD, TWD...
    import_script    TEXT,               -- tên class importer
    is_active        BOOLEAN DEFAULT TRUE,
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO ncc_vendor_config (ncc_code, ncc_name, file_table, data_type, price_currency, import_script) VALUES
    ('WM',  'WORLDMOVE',    'ncc_worldmove', 'products', 'USD', 'NccWorldmoveImporter'),
    ('3H',  '3HK',          'ncc_3hk',       'zones',    'HKD', 'Ncc3hkImporter'),
    ('3D',  '3HK DATAPOOL', 'ncc_3hk',       'zones',    'HKD', 'Ncc3hkImporter'),
    ('BC',  'Billion Connect', NULL,          'products', 'USD', 'NccBcImporter'),
    ('SS',  'Simstore',     NULL,             'products', 'USD', 'NccSimstoreImporter'),
    ('VT',  'Viettel',      NULL,             'products', 'VND', 'NccViettelImporter'),
    ('TM',  'Truemove',     NULL,             'products', 'THB', 'NccTruemoveImporter')
ON CONFLICT (ncc_code) DO UPDATE SET
    ncc_name      = EXCLUDED.ncc_name,
    file_table    = EXCLUDED.file_table,
    import_script = EXCLUDED.import_script;

-- ── 5. NCC products unified view ─────────────────────────────────────────────
-- Chuẩn hóa data từ tất cả NCC vào 1 view cho chatbot query

CREATE OR REPLACE VIEW ncc_products_unified AS
SELECT
    vendor_product_id,
    'WM'                AS ncc_code,
    'WORLDMOVE'         AS ncc_name,
    product_name,
    sim_type,
    region,
    days,
    data_gb,
    is_unlimited,
    is_daily,
    is_lesim,
    throttle_kbps,      -- ncc_worldmove dùng throttle_kbps (integer kbps)
    apn,
    network_type,
    onsite_carrier,
    exist,
    cogs                AS price_amount,
    cogs_currency       AS price_currency,   -- TWD (hoặc USD cho một số sản phẩm)
    NULL::TEXT[]        AS country_iso_codes
FROM ncc_worldmove

UNION ALL

SELECT
    zone || '_3hk'                       AS vendor_product_id,
    '3H'                                 AS ncc_code,
    '3HK'                                AS ncc_name,
    zone || ' (' || country || ')'       AS product_name,
    'eSIM'                               AS sim_type,
    country                              AS region,
    NULL::INTEGER                        AS days,
    NULL::NUMERIC                        AS data_gb,
    NULL::BOOLEAN                        AS is_unlimited,
    NULL::BOOLEAN                        AS is_daily,
    NULL::BOOLEAN                        AS is_lesim,
    NULL::INTEGER                        AS throttle_kbps,
    NULL::TEXT                           AS apn,
    network                              AS network_type,
    NULL::TEXT                           AS onsite_carrier,
    NULL::TEXT                           AS exist,
    price_per_gb_hkd                     AS price_amount,
    'HKD'                                AS price_currency,
    NULL::TEXT[]                         AS country_iso_codes
FROM ncc_3hk;

-- ── 6. Bảng data_file_registry: track file imports ───────────────────────────
-- Phát hiện thay đổi file mà không cần chạy lại import toàn bộ

CREATE TABLE IF NOT EXISTS data_file_registry (
    file_key      TEXT PRIMARY KEY,   -- ví dụ: 'ref/countries', 'ncc/worldmove'
    file_name     TEXT,               -- tên file thực tế
    sha256        TEXT,               -- hash nội dung file
    row_count     INTEGER,
    last_imported TIMESTAMPTZ,
    status        TEXT DEFAULT 'pending',  -- 'ok' | 'error' | 'pending'
    error_msg     TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 7. Indexes toàn diện ─────────────────────────────────────────────────────

-- products
CREATE INDEX IF NOT EXISTS idx_products_status      ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_tenant       ON products(tenant);
CREATE INDEX IF NOT EXISTS idx_products_vendor_code  ON products(vendor_code);
CREATE INDEX IF NOT EXISTS idx_products_product_type ON products(product_type);
CREATE INDEX IF NOT EXISTS idx_products_kyc_needed   ON products(kyc_needed);
CREATE INDEX IF NOT EXISTS idx_products_type_of_sim  ON products(type_of_sim);

-- skus
CREATE INDEX IF NOT EXISTS idx_skus_status        ON skus(status);
CREATE INDEX IF NOT EXISTS idx_skus_tenant        ON skus(tenant);
CREATE INDEX IF NOT EXISTS idx_skus_product_code  ON skus(product_code);
CREATE INDEX IF NOT EXISTS idx_skus_vendor_sku    ON skus(vendor_sku);
CREATE INDEX IF NOT EXISTS idx_skus_sim_esim      ON skus(sim_esim);
CREATE INDEX IF NOT EXISTS idx_skus_day_amount    ON skus(day_amount);
CREATE INDEX IF NOT EXISTS idx_skus_data_amount   ON skus(data_amount);
CREATE INDEX IF NOT EXISTS idx_skus_status_tenant ON skus(status, tenant);

-- listings
CREATE INDEX IF NOT EXISTS idx_listings_status           ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_tenant           ON listings(tenant);
CREATE INDEX IF NOT EXISTS idx_listings_ref_product_code ON listings(reference_product_code);
CREATE INDEX IF NOT EXISTS idx_listings_listing_type     ON listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_listings_category_code    ON listings(category_code);

-- items
CREATE INDEX IF NOT EXISTS idx_items_status        ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_tenant        ON items(tenant);
CREATE INDEX IF NOT EXISTS idx_items_sku_code      ON items(sku_code);
CREATE INDEX IF NOT EXISTS idx_items_listing_code  ON items(listing_code);
CREATE INDEX IF NOT EXISTS idx_items_item_type     ON items(item_type);
CREATE INDEX IF NOT EXISTS idx_items_alias         ON items(alias);
CREATE INDEX IF NOT EXISTS idx_items_category_code ON items(category_code);
CREATE INDEX IF NOT EXISTS idx_items_status_tenant ON items(status, tenant);

-- ref tables
CREATE INDEX IF NOT EXISTS idx_ref_sc_country_codes ON ref_support_countries USING gin(to_tsvector('simple', coalesce(country_codes,'')));
CREATE INDEX IF NOT EXISTS idx_ref_countries_continent  ON ref_countries(continent);
CREATE INDEX IF NOT EXISTS idx_ref_countries_sub_region ON ref_countries(sub_region);

-- ncc
CREATE INDEX IF NOT EXISTS idx_ncc_wm_region      ON ncc_worldmove(region);
CREATE INDEX IF NOT EXISTS idx_ncc_wm_sim_type    ON ncc_worldmove(sim_type);
CREATE INDEX IF NOT EXISTS idx_ncc_wm_days        ON ncc_worldmove(days);
CREATE INDEX IF NOT EXISTS idx_ncc_wm_exist       ON ncc_worldmove(exist);
CREATE INDEX IF NOT EXISTS idx_ncc_wm_is_unlimited ON ncc_worldmove(is_unlimited);
