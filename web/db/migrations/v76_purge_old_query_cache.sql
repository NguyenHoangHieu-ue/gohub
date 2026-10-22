-- v76: dọn dòng cache dữ liệu cũ trong analytics_query_cache (~65MB). Từ s203 dữ liệu cache nằm ở Vercel Runtime Cache;
-- bảng này CHỈ còn giữ registry prewarm (sqlreg:/urlreg:). Mọi dòng khác đều >7 ngày tuổi và không code nào đọc lại
-- (nếu có, chỉ là cache-miss rồi tính lại). Supabase Hobby giới hạn DB 500MB, đang 523MB.

DELETE FROM analytics_query_cache
WHERE cache_key NOT LIKE 'sqlreg:%' AND cache_key NOT LIKE 'urlreg:%';

-- Trả dung lượng đĩa thật (DELETE thường không làm DB nhỏ đi). Bảng đã nhỏ nên khoá rất ngắn.
VACUUM FULL analytics_query_cache;

-- Kiểm lại:
-- SELECT pg_size_pretty(pg_database_size(current_database()));
-- SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;
