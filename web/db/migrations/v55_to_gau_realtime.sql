-- v55: Bật Supabase Realtime cho chat_messages (Tổ Gấu)
--
-- Bug: tin nhắn của NGƯỜI KHÁC không tự hiện, phải F5 mới thấy (tin của chính mình luôn thấy ngay vì
-- FE append optimistic cục bộ, không phụ thuộc Realtime). FE đã subscribe đúng "postgres_changes" từ
-- s142, nhưng bảng chat_messages CHƯA TỪNG được thêm vào publication `supabase_realtime` — thiếu bước
-- này thì Postgres không phát WAL change ra Realtime server; subscribe() không báo lỗi gì (channel vẫn
-- SUBSCRIBED bình thường), chỉ đơn giản không bao giờ nhận event nào. Migration v34 tạo bảng nhưng
-- không có bước này (thường làm qua Dashboard → Database → Replication, dễ bỏ sót vì không có cảnh báo).
--
-- Idempotent: chạy lại nhiều lần không lỗi ("relation already member of publication").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
  END IF;
END $$;
