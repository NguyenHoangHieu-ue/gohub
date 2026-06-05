-- Chạy trong Supabase SQL Editor để fix gap analysis
-- (đổi join key từ vendor_internal_id → vendor_product_id)

CREATE OR REPLACE FUNCTION count_ncc_gap(p_vendor TEXT, p_in_system BOOLEAN)
RETURNS INTEGER AS $$
    SELECT COUNT(*)::INTEGER FROM ncc_products n
    WHERE n.vendor = p_vendor
    AND CASE
        WHEN p_in_system THEN
            EXISTS (SELECT 1 FROM skus s WHERE s.vendor_sku = n.vendor_product_id)
        ELSE
            NOT EXISTS (SELECT 1 FROM skus s WHERE s.vendor_sku = n.vendor_product_id)
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
            EXISTS (SELECT 1 FROM skus s WHERE s.vendor_sku = n.vendor_product_id)
        ELSE
            NOT EXISTS (SELECT 1 FROM skus s WHERE s.vendor_sku = n.vendor_product_id)
    END
    ORDER BY n.vendor_product_id
    OFFSET p_offset LIMIT p_limit
$$ LANGUAGE sql STABLE;
