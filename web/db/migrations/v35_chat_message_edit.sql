-- v35: Thêm cột edit/recall cho chat_messages (Phase 5 #4)
-- Chạy trong Supabase SQL Editor.

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz,
  ADD COLUMN IF NOT EXISTS is_recalled boolean DEFAULT false;
