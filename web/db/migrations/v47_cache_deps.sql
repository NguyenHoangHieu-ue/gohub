-- v47: thêm cột deps cho analytics_query_cache — thay cơ chế flush-theo-prefix-viết-tay bằng
-- flush-theo-chủ-đề (deps) khai NGAY tại chỗ cache.
--
-- TRƯỚC: mỗi route ghi cost/target B2B phải gọi flushB2BCostCaches(), dựa vào hằng số
-- B2B_COST_CACHE_PREFIXES liệt kê TAY từng cache-key-prefix của mọi route GET đang cache dữ liệu phụ
-- thuộc cost B2B — 2 nơi (route cache thật vs danh sách prefix) tách rời nhau, đã lệch nhau thành
-- silent no-op ít nhất 1 lần (s169, "Tải lại mới" không xoá được cache hiện hành vì prefix cũ chưa
-- bump version theo).
--
-- NAY (s190+2): mỗi cachedQuery() tự khai nó phụ thuộc "chủ đề" nào (vd deps=['b2b-cost']) NGAY tại
-- chỗ gọi — route ghi dữ liệu chỉ cần flushByDeps(['b2b-cost']), không cần biết/nhớ route nào khác
-- đang cache nó. Không còn danh sách rời rạc nào có thể lệch khỏi thực tế.
ALTER TABLE analytics_query_cache ADD COLUMN IF NOT EXISTS deps TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_analytics_query_cache_deps ON analytics_query_cache USING GIN (deps);
