-- ============================================================
-- Gohub PM — Supabase schema
-- Chạy file này trong SQL Editor của Supabase project
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
    product_code            TEXT PRIMARY KEY,
    product_ref             TEXT, tenant TEXT, status TEXT,
    type_of_sim             TEXT, product_type TEXT, operator_code TEXT,
    vendor_code             TEXT, purchase_type TEXT, gc_purchase_type TEXT,
    source_type             TEXT, sku_type TEXT, data_type TEXT,
    import_type             TEXT, supported_countries TEXT, network_type TEXT,
    onsite_carrier          TEXT, local_phone_number TEXT, hotspot TEXT,
    kyc_code                TEXT, kyc_needed TEXT, top_up_options TEXT,
    date_created            TEXT, last_modified_date TEXT,
    base_sim_esim_sku_code  TEXT, daily_reset_time TEXT, activation_time TEXT,
    apn_original            TEXT, apn TEXT, local_number_country TEXT,
    kyc_links               TEXT, activation TEXT, unsupported_apps TEXT,
    telco_perks             TEXT, note TEXT, data_plan_type TEXT,
    synced_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skus (
    sku_code                    TEXT PRIMARY KEY,
    sku_ref                     TEXT, product_code TEXT, tenant TEXT, status TEXT,
    sim_esim                    TEXT, product_type TEXT, parents TEXT,
    throttle_speed              TEXT, call TEXT, expirations TEXT, currency TEXT,
    day_amount                  INTEGER, day_amount_unit TEXT,
    data_amount                 NUMERIC, data_amount_unit TEXT,
    date_created                TEXT, last_modified_date TEXT,
    frame                       TEXT, datapack TEXT, call_sms_details TEXT,
    vendor_sku                  TEXT, vendor_sku_sim TEXT,
    original_cost               NUMERIC, reference_cost_vnd NUMERIC,
    latest_cogs                 NUMERIC, latest_cogs_currency TEXT,
    final_cogs_included_vat_vnd NUMERIC, final_cogs_usd NUMERIC,
    wr_group                    TEXT,
    synced_at                   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
    listing_code                    TEXT PRIMARY KEY,
    listing_ref                     TEXT, reference_product_code TEXT,
    tenant                          TEXT, status TEXT,
    listing_name_en                 TEXT, listing_name_vn TEXT,
    listing_type                    TEXT, price_list TEXT,
    type_of_sim                     TEXT, product_type TEXT, network_operator TEXT,
    data_type_en                    TEXT, data_type_vn TEXT,
    esim_type_en                    TEXT, esim_type_vn TEXT,
    category_code                   TEXT,
    daily_reset_time_en             TEXT, daily_reset_time_vn TEXT,
    activation_time_en              TEXT, activation_time_vn TEXT,
    network_type                    TEXT, hotspot_en TEXT, hotspot_vn TEXT,
    kyc_needed_en                   TEXT, kyc_needed_vn TEXT,
    kyc_links_en                    TEXT, kyc_links_vn TEXT,
    expirations_en                  INTEGER, expirations_vn INTEGER,
    top_up_options_en               TEXT, top_up_options_vn TEXT,
    activation_en                   TEXT, activation_vn TEXT,
    activation_links_en             TEXT, activation_links_vn TEXT,
    special_activation_required_en  TEXT, special_activation_required_vn TEXT,
    raw_unsupported_apps            TEXT, unsupported_apps_en TEXT, unsupported_apps_vn TEXT,
    unsupported_apps_highlight_en   TEXT, unsupported_apps_highlight_vn TEXT,
    telco_perks_en                  TEXT, telco_perks_vn TEXT,
    raw_note                        TEXT, raw_note_vn TEXT,
    note_en                         TEXT, note_en_backup TEXT,
    note_vn                         TEXT, note_vn_backup TEXT,
    call_sms_details_en             TEXT, call_sms_details_vn TEXT,
    local_phone_number_en           TEXT, local_phone_number_vn TEXT,
    local_phone_number_country      TEXT, call_en TEXT, call_vn TEXT,
    supported_country_name_en       TEXT, supported_country_name_vn TEXT,
    category_name_en                TEXT, category_name_vn TEXT,
    apn                             TEXT,
    change_apn_note_en              TEXT, change_apn_note_vn TEXT,
    change_apn_links_en             TEXT, change_apn_links_vn TEXT,
    kyc_pdf_template_code           TEXT, activation_pdf_template_code TEXT,
    date_created                    TEXT, last_modified_date TEXT,
    synced_at                       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
    item_code           TEXT PRIMARY KEY,
    item_ref            TEXT, alias TEXT, sku_code TEXT, listing_code TEXT,
    tenant              TEXT, category_code TEXT, status TEXT,
    item_type           TEXT, price_list TEXT,
    item_name_en        TEXT, item_name_vn TEXT,
    day_amount          INTEGER, day_amount_unit TEXT,
    data_amount         TEXT,  data_amount_unit TEXT,
    throttle_speed_en   TEXT,  throttle_speed_vn TEXT,
    call_en             TEXT,  call_vn TEXT,
    call_sms_details_en TEXT,  call_sms_details_vn TEXT,
    sales_channel       TEXT,  channel TEXT, pricelistcode TEXT,
    unitprice           NUMERIC, currency TEXT,
    date_created        TEXT,  last_modified_date TEXT,
    synced_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_log (
    table_name   TEXT PRIMARY KEY,
    last_sync    TIMESTAMPTZ DEFAULT NOW(),
    record_count INTEGER
);

CREATE TABLE IF NOT EXISTS users (
    username    TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT,
    role        TEXT NOT NULL DEFAULT 'sale',
    password    TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Chỉ service role mới được truy cập bảng users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- NCC (Nhà Cung Cấp) tables — thêm sau
-- ============================================================

CREATE TABLE IF NOT EXISTS ncc_products (
    id                  SERIAL PRIMARY KEY,
    vendor              TEXT NOT NULL,          -- 'WORLDMOVE', future vendors
    vendor_product_id   TEXT,                   -- wmproductId (WM primary key from vendor)
    vendor_internal_id  TEXT,                   -- productId (WM) — matches skus.vendor_sku
    product_name        TEXT,
    region              TEXT,
    sim_type            TEXT,                   -- 'eSIM', 'SIM', 'Top-Up SIM'
    days                INTEGER,
    data_gb             NUMERIC,               -- total GB (fixed) or GB/day (daily)
    is_daily            BOOLEAN DEFAULT FALSE, -- true = data_gb is per-day limit
    is_unlimited        BOOLEAN DEFAULT FALSE,
    throttle_kbps       INTEGER,
    cogs                NUMERIC,
    cogs_currency       TEXT,                  -- 'TWD' (WM), 'HKD' (3HK)
    is_kyc              BOOLEAN DEFAULT FALSE,
    is_lesim            BOOLEAN DEFAULT FALSE, -- WM: shared leSIM pool
    status              TEXT DEFAULT 'active',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ncc_products_vendor_uniq
    ON ncc_products(vendor, vendor_product_id);

CREATE TABLE IF NOT EXISTS ncc_3hk_zones (
    id               SERIAL PRIMARY KEY,
    zone             TEXT NOT NULL,   -- 'A1', 'A2', 'B', 'C'
    country          TEXT NOT NULL,
    network          TEXT,
    price_per_gb_hkd NUMERIC,
    is_kyc           BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- RPC functions for gap analysis (WORLDMOVE vs system SKUs)
-- Chạy sau khi đã import data vào ncc_products

CREATE OR REPLACE FUNCTION count_ncc_gap(p_vendor TEXT, p_in_system BOOLEAN)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER FROM ncc_products n
    WHERE n.vendor = p_vendor
    AND CASE
        WHEN p_in_system THEN
            EXISTS (SELECT 1 FROM skus s WHERE s.vendor_sku = n.vendor_internal_id)
        ELSE
            NOT EXISTS (SELECT 1 FROM skus s WHERE s.vendor_sku = n.vendor_internal_id)
    END
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION get_ncc_gap(
    p_vendor    TEXT,
    p_in_system BOOLEAN,
    p_offset    INTEGER DEFAULT 0,
    p_limit     INTEGER DEFAULT 50
)
RETURNS SETOF ncc_products AS $$
    SELECT n.* FROM ncc_products n
    WHERE n.vendor = p_vendor
    AND CASE
        WHEN p_in_system THEN
            EXISTS (SELECT 1 FROM skus s WHERE s.vendor_sku = n.vendor_internal_id)
        ELSE
            NOT EXISTS (SELECT 1 FROM skus s WHERE s.vendor_sku = n.vendor_internal_id)
    END
    ORDER BY n.vendor_product_id
    OFFSET p_offset LIMIT p_limit
$$ LANGUAGE sql STABLE;
