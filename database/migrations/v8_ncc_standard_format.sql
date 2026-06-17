-- v8_ncc_standard_format.sql
-- Chuẩn hóa NCC: vendor_code trên ncc_worldmove + bảng ncc_datapool mới

-- 1. Thêm vendor_code vào ncc_worldmove
ALTER TABLE ncc_worldmove ADD COLUMN IF NOT EXISTS vendor_code TEXT DEFAULT 'WM';
UPDATE ncc_worldmove SET vendor_code = 'WM' WHERE vendor_code IS NULL OR vendor_code = '';
CREATE INDEX IF NOT EXISTS idx_ncc_wm_vendor_code ON ncc_worldmove(vendor_code);

-- 2. Bảng ncc_datapool: gói datapool chuẩn (3HK zones + các vendor tương tự)
--    Mỗi row = 1 zone/pool với danh sách nước và giá/GB
CREATE TABLE IF NOT EXISTS ncc_datapool (
    id           SERIAL PRIMARY KEY,
    vendor_code  TEXT NOT NULL,
    zone_id      TEXT NOT NULL,
    zone_name    TEXT,
    countries    TEXT,              -- danh sách nước, phẩy cách
    sim_type     TEXT DEFAULT 'eSIM',
    price_per_gb NUMERIC,
    currency     TEXT DEFAULT 'HKD',
    network_type TEXT,
    is_kyc       BOOLEAN DEFAULT FALSE,
    notes        TEXT,
    status       TEXT DEFAULT 'active',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (vendor_code, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_ncc_datapool_vendor ON ncc_datapool(vendor_code);
CREATE INDEX IF NOT EXISTS idx_ncc_datapool_status ON ncc_datapool(status);
