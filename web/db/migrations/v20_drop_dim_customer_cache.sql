-- Migration v20: DROP dim_customer_cache.
-- Bảng mirror dim_customer (tạo ở v19) nay ORPHAN — đã revert về JOIN trực tiếp
-- gohub_dw (commit 7f77e39). Không còn code nào đọc/ghi bảng này.
-- Chạy trong Supabase SQL Editor.

DROP TABLE IF EXISTS dim_customer_cache;
