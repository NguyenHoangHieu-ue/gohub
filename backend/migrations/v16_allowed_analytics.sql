-- v16: Per-user analytics page restrictions
-- Lưu danh sách analytics pages user được phép truy cập (comma-separated IDs)
-- NULL = không giới hạn (xem tất cả theo role)
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_analytics TEXT DEFAULT NULL;
