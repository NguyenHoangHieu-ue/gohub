-- ============================================================
-- Migration: ncc_products + ncc_3hk_zones → ncc_worldmove + ncc_3hk
-- Chạy SAU KHI đã tạo ncc_worldmove và ncc_3hk (setup/)
-- ============================================================

-- 0. Fix column name (nếu tạo bảng trước khi có bản fix)
ALTER TABLE ncc_worldmove RENAME COLUMN roaming TO prepaid_card;

-- 1. Migrate WORLDMOVE data
INSERT INTO ncc_worldmove (
    vendor_product_id, product_name, region, sim_type,
    days, data_gb, is_daily, is_unlimited, throttle_kbps,
    cogs, cogs_currency, is_kyc, is_lesim,
    apn, network_type, onsite_carrier, providers,
    coverage, data_reset, notification, prepaid_card,
    status, created_at, updated_at
)
SELECT
    vendor_product_id, product_name, region, sim_type,
    days, data_gb, is_daily, is_unlimited, throttle_kbps,
    cogs, cogs_currency, is_kyc, is_lesim,
    apn, apn_network_type, apn_roaming_carrier, apn_telecom_providers,
    apn_coverage_area, apn_data_reset, apn_notification, apn_prepaid_card,
    status, created_at, updated_at
FROM ncc_products
WHERE vendor = 'WORLDMOVE'
ON CONFLICT (vendor_product_id) DO NOTHING;

-- 2. Migrate 3HK zones
INSERT INTO ncc_3hk (zone, country, network, price_per_gb_hkd, is_kyc, created_at)
SELECT zone, country, network, price_per_gb_hkd, is_kyc, created_at
FROM ncc_3hk_zones
ON CONFLICT DO NOTHING;

-- 3. Drop old RPC functions
DROP FUNCTION IF EXISTS count_ncc_gap(TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS get_ncc_gap(TEXT, BOOLEAN, INTEGER, INTEGER);

-- 4. Drop old tables (chạy sau khi verify data migration OK)
DROP TABLE IF EXISTS ncc_products;
DROP TABLE IF EXISTS ncc_3hk_zones;
