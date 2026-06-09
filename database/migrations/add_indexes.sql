-- ============================================================
-- Migration: Performance indexes cho tất cả bảng chính
-- Chạy trong Supabase SQL Editor
-- Ước tính thời gian: 2-5 phút (items 137k rows là lâu nhất)
-- ============================================================

-- pg_trgm cho phép GIN index hỗ trợ ILIKE '%search%'
-- (Supabase thường đã bật sẵn, thêm IF NOT EXISTS cho an toàn)
CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ============================================================
-- BẢNG: items (137k rows — ưu tiên cao nhất)
-- Bottleneck lớn nhất: mọi request đều filter status='Active'
-- ============================================================

-- Partial index cho Active items: planner dùng index nhỏ ~130k thay full-scan 137k
CREATE INDEX IF NOT EXISTS idx_items_status
  ON items(status);

CREATE INDEX IF NOT EXISTS idx_items_tenant
  ON items(tenant);

-- Composite: (status, tenant) — pattern phổ biến nhất: Active + tenant
CREATE INDEX IF NOT EXISTS idx_items_status_tenant
  ON items(status, tenant);

-- item_type và sales_channel filter (mới thêm)
CREATE INDEX IF NOT EXISTS idx_items_item_type
  ON items(item_type);

CREATE INDEX IF NOT EXISTS idx_items_sales_channel
  ON items(sales_channel);

-- JOIN key: items.sku_code và listing_code dùng để lookup từ WM/chatbot
CREATE INDEX IF NOT EXISTS idx_items_sku_code
  ON items(sku_code);

CREATE INDEX IF NOT EXISTS idx_items_listing_code
  ON items(listing_code);

-- GIN trgm: ILIKE search trên alias, sku_code, item_name_vn, listing_code
-- Quan trọng vì search mỗi keystroke gọi API (debounce 400ms)
CREATE INDEX IF NOT EXISTS idx_items_alias_trgm
  ON items USING GIN(alias gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_sku_code_trgm
  ON items USING GIN(sku_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_listing_code_trgm
  ON items USING GIN(listing_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_name_vn_trgm
  ON items USING GIN(item_name_vn gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_item_code_trgm
  ON items USING GIN(item_code gin_trgm_ops);


-- ============================================================
-- BẢNG: skus (10,957 rows)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_skus_status
  ON skus(status);

CREATE INDEX IF NOT EXISTS idx_skus_tenant
  ON skus(tenant);

CREATE INDEX IF NOT EXISTS idx_skus_status_tenant
  ON skus(status, tenant);

-- product_code: dùng nhiều nhất — JOIN từ skus API (enrich) + chatbot searchSkus
CREATE INDEX IF NOT EXISTS idx_skus_product_code
  ON skus(product_code);

-- vendor_sku: dùng trong enrichWithSku (WM gap analysis)
--   .in("vendor_sku", ids) với ids up to ~50 values mỗi request
CREATE INDEX IF NOT EXISTS idx_skus_vendor_sku
  ON skus(vendor_sku);

-- Partial index: WM SKUs (vendor_sku ILIKE 'WM-%')
-- Dùng trong /api/ncc/worldmove để fetch sysSet (up to 2000 rows)
CREATE INDEX IF NOT EXISTS idx_skus_vendor_sku_wm
  ON skus(vendor_sku)
  WHERE vendor_sku LIKE 'WM-%';

-- GIN trgm: ILIKE search
CREATE INDEX IF NOT EXISTS idx_skus_sku_code_trgm
  ON skus USING GIN(sku_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_skus_vendor_sku_trgm
  ON skus USING GIN(vendor_sku gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_skus_product_code_trgm
  ON skus USING GIN(product_code gin_trgm_ops);


-- ============================================================
-- BẢNG: listings (10,674 rows)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_listings_status
  ON listings(status);

CREATE INDEX IF NOT EXISTS idx_listings_tenant
  ON listings(tenant);

CREATE INDEX IF NOT EXISTS idx_listings_status_tenant
  ON listings(status, tenant);

-- reference_product_code: JOIN key từ listings → products
CREATE INDEX IF NOT EXISTS idx_listings_reference_product_code
  ON listings(reference_product_code);

-- listing_type: filter mới thêm (/api/listings?ltype=...)
CREATE INDEX IF NOT EXISTS idx_listings_listing_type
  ON listings(listing_type);

-- GIN trgm: ILIKE search trên text columns
CREATE INDEX IF NOT EXISTS idx_listings_name_vn_trgm
  ON listings USING GIN(listing_name_vn gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_listings_name_en_trgm
  ON listings USING GIN(listing_name_en gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_listings_network_operator_trgm
  ON listings USING GIN(network_operator gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_listings_ref_product_code_trgm
  ON listings USING GIN(reference_product_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_listings_listing_code_trgm
  ON listings USING GIN(listing_code gin_trgm_ops);


-- ============================================================
-- BẢNG: products (769 rows — nhỏ nhưng JOIN target của skus)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_products_status
  ON products(status);

CREATE INDEX IF NOT EXISTS idx_products_tenant
  ON products(tenant);

-- vendor_code + operator_code: filter trực tiếp qua /api/products
CREATE INDEX IF NOT EXISTS idx_products_vendor_code
  ON products(vendor_code);

CREATE INDEX IF NOT EXISTS idx_products_operator_code
  ON products(operator_code);

-- GIN trgm
CREATE INDEX IF NOT EXISTS idx_products_vendor_code_trgm
  ON products USING GIN(vendor_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_operator_code_trgm
  ON products USING GIN(operator_code gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_supported_countries_trgm
  ON products USING GIN(supported_countries gin_trgm_ops);


-- ============================================================
-- BẢNG: ncc_worldmove (8,921 rows)
-- Filter pattern: sim_type eq, region ilike, is_unlimited eq,
--   is_daily eq, days eq, data_gb gte/lte
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ncc_wm_status
  ON ncc_worldmove(status);

CREATE INDEX IF NOT EXISTS idx_ncc_wm_sim_type
  ON ncc_worldmove(sim_type);

CREATE INDEX IF NOT EXISTS idx_ncc_wm_is_unlimited
  ON ncc_worldmove(is_unlimited);

CREATE INDEX IF NOT EXISTS idx_ncc_wm_is_daily
  ON ncc_worldmove(is_daily);

CREATE INDEX IF NOT EXISTS idx_ncc_wm_days
  ON ncc_worldmove(days);

CREATE INDEX IF NOT EXISTS idx_ncc_wm_data_gb
  ON ncc_worldmove(data_gb);

-- Composite: (sim_type, is_unlimited, is_daily) — 3 filters thường đi cùng nhau
CREATE INDEX IF NOT EXISTS idx_ncc_wm_type_combo
  ON ncc_worldmove(sim_type, is_unlimited, is_daily);

-- vendor_product_id: .in() trong gap analysis (in_system check)
-- Thường là PK/unique nhưng thêm explicit index để chắc chắn
CREATE INDEX IF NOT EXISTS idx_ncc_wm_vendor_product_id
  ON ncc_worldmove(vendor_product_id);

-- GIN trgm: ILIKE search trên product_name, region
CREATE INDEX IF NOT EXISTS idx_ncc_wm_product_name_trgm
  ON ncc_worldmove USING GIN(product_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ncc_wm_region_trgm
  ON ncc_worldmove USING GIN(region gin_trgm_ops);


-- ============================================================
-- BẢNG: ncc_3hk (45 rows — nhỏ, không cần index nhiều)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ncc_3hk_zone
  ON ncc_3hk(zone);


-- ============================================================
-- BẢNG: ref_countries, ref_support_countries
-- Dùng trong chatbot context + country decode
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ref_countries_code
  ON ref_countries(code);

CREATE INDEX IF NOT EXISTS idx_ref_support_countries_code
  ON ref_support_countries(code);

CREATE INDEX IF NOT EXISTS idx_ref_countries_name_trgm
  ON ref_countries USING GIN(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ref_support_countries_trgm
  ON ref_support_countries USING GIN(support_country gin_trgm_ops);


-- ============================================================
-- VERIFY: xem index đã tạo
-- Chạy query này sau khi migration để kiểm tra
-- ============================================================
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN ('items','skus','listings','products','ncc_worldmove','ncc_3hk','ref_countries','ref_support_countries')
-- ORDER BY tablename, indexname;
