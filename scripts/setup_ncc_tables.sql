-- ============================================================
-- Chạy file này trong Supabase SQL Editor
-- https://supabase.com/dashboard/project/wfuigmfnfcijkvylrwzz/sql/new
-- ============================================================

CREATE TABLE IF NOT EXISTS ncc_products (
    id                  SERIAL PRIMARY KEY,
    vendor              TEXT NOT NULL,
    vendor_product_id   TEXT,
    vendor_internal_id  TEXT,
    product_name        TEXT,
    region              TEXT,
    sim_type            TEXT,
    days                INTEGER,
    data_gb             NUMERIC,
    is_daily            BOOLEAN DEFAULT FALSE,
    is_unlimited        BOOLEAN DEFAULT FALSE,
    throttle_kbps       INTEGER,
    cogs                NUMERIC,
    cogs_currency       TEXT,
    is_kyc              BOOLEAN DEFAULT FALSE,
    is_lesim            BOOLEAN DEFAULT FALSE,
    status              TEXT DEFAULT 'active',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ncc_products_vendor_uniq
    ON ncc_products(vendor, vendor_product_id);

CREATE TABLE IF NOT EXISTS ncc_3hk_zones (
    id               SERIAL PRIMARY KEY,
    zone             TEXT NOT NULL,
    country          TEXT NOT NULL,
    network          TEXT,
    price_per_gb_hkd NUMERIC,
    is_kyc           BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

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
