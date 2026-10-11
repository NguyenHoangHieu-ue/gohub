-- v72: Trí nhớ trợ lý giữ LỊCH SỬ khi cập nhật (plan personal-agent.md P1). Trước đây `update` ghi đè content nên giá trị cũ mất
-- (eval P0: hỏi "trước khi đổi là bao nhiêu" → 0/5). Mỗi lần update đổi nội dung, giá trị cũ được đẩy vào cột history
-- dạng [{"c": "nội dung cũ", "at": "ISO thời điểm bị thay"}] (giữ tối đa 5 bản gần nhất, code cắt).
-- Chưa chạy migration → code tự dùng hành vi cũ (ghi đè), không lỗi.
ALTER TABLE assistant_memory ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
