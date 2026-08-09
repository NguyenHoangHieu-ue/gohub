-- v32: Thêm cột ai_response vào app_usage_events để lưu câu trả lời Bé Gấu
-- Dùng cho tab "Chất lượng AI" trong Usage Analytics (đánh giá chất lượng Bé Gấu)
-- Chạy trong Supabase SQL Editor

ALTER TABLE app_usage_events ADD COLUMN IF NOT EXISTS ai_response TEXT;
