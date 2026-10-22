-- v77: bỏ index không dùng/trùng của items + listings (kiểm 2026-10-22 bằng pg_stat_user_indexes). Index của 2 bảng này
-- (139MB + 52MB) lớn hơn cả dữ liệu; DB đang 512MB / giới hạn 500MB của Supabase Hobby. Tiết kiệm ~89MB.
-- Không đổi dữ liệu, không đổi code; DROP INDEX có thể tạo lại bằng định nghĩa ghi bên cạnh nếu cần.

-- items: 0 lần dùng
DROP INDEX IF EXISTS idx_items_status_tenant;        -- (status, tenant)            3.8MB, 0 lần
DROP INDEX IF EXISTS idx_items_sales_channel;        -- (sales_channel)             3.5MB, 0 lần (cột toàn NULL)
-- items: 3 chỉ mục trigram chỉ phục vụ ô tìm kiếm tab Item (OR 5 cột; mỗi cái chỉ 2 lần dùng trong cả vòng đời). Bỏ → tìm kiếm quét tuần tự
-- (~1–2s trên 264k dòng, vẫn dưới timeout). GIỮ item_code_trgm và sku_code_trgm (104 và 48 lần dùng).
DROP INDEX IF EXISTS idx_items_name_vn_trgm;         -- gin_trgm_ops(item_name_vn)  24MB
DROP INDEX IF EXISTS idx_items_alias_trgm;           -- gin_trgm_ops(alias)         15MB
DROP INDEX IF EXISTS idx_items_listing_code_trgm;    -- gin_trgm_ops(listing_code)  14MB

-- listings: 0 lần dùng / trùng lặp
DROP INDEX IF EXISTS idx_listings_metadata;               -- gin(metadata)                    14MB, 0 lần
DROP INDEX IF EXISTS idx_listings_network_operator_trgm;  -- trgm(network_operator)           13MB, 0 lần (code tìm theo metadata->>network_operator, không dùng cột này)
DROP INDEX IF EXISTS idx_listings_tenant;                 -- (tenant)                         0,5MB, 0 lần
DROP INDEX IF EXISTS idx_listings_listing_type;           -- (listing_type)                   0,5MB, 0 lần
DROP INDEX IF EXISTS idx_listings_reference_product_code; -- trùng idx_listings_ref_product_code (cùng cột), 0 lần

-- Sau khi chạy, kiểm lại:
-- SELECT pg_size_pretty(pg_database_size(current_database()));
