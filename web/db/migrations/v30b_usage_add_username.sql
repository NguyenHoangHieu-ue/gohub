-- v30b: thêm user_name vào app_usage_events
ALTER TABLE app_usage_events ADD COLUMN IF NOT EXISTS user_name TEXT;
