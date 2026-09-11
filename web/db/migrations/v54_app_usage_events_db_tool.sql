-- v54: My Metrics nhóm B — "Tasks via Bé Gấu" chỉ tính task ĐÃ THẬT SỰ xuất dữ liệu từ DB
-- (không phải trả lời chay/chào hỏi dài). be-gau.ts giờ track tool nào được gọi mỗi round, ghi lại
-- ĐÚNG SỰ THẬT vào 2 cột dưới; định nghĩa "tool nào tính là DB task" nằm ở lib/okr-helpers.ts
-- (DB_TASK_TOOLS), không hardcode ở DB.
ALTER TABLE app_usage_events ADD COLUMN IF NOT EXISTS tools_used TEXT[];
ALTER TABLE app_usage_events ADD COLUMN IF NOT EXISTS used_db_tool BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_app_usage_events_used_db_tool ON app_usage_events (used_db_tool) WHERE used_db_tool = TRUE;
