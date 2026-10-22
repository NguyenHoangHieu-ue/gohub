-- v76: dọn dòng cache dữ liệu cũ trong analytics_query_cache (~65MB). Từ s203 dữ liệu cache nằm ở Vercel Runtime Cache;
-- bảng này CHỈ còn giữ registry prewarm (sqlreg:/urlreg:). Mọi dòng khác đều >7 ngày tuổi và không code nào đọc lại
-- (nếu có, chỉ là cache-miss rồi tính lại). Supabase Hobby giới hạn DB 500MB, đang 523MB.
-- Dùng TRUNCATE (trả dung lượng ngay, chạy được trong transaction của SQL Editor; VACUUM FULL thì KHÔNG chạy được ở đó).

BEGIN;
CREATE TEMP TABLE _qc_keep ON COMMIT DROP AS
  SELECT * FROM analytics_query_cache WHERE cache_key LIKE 'sqlreg:%' OR cache_key LIKE 'urlreg:%';
TRUNCATE analytics_query_cache;
INSERT INTO analytics_query_cache SELECT * FROM _qc_keep;
COMMIT;

-- Kiểm lại (chạy riêng):
-- SELECT count(*) FROM analytics_query_cache;   -- còn ~750
-- SELECT pg_size_pretty(pg_database_size(current_database()));
