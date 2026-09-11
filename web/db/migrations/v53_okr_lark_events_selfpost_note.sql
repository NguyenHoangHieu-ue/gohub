-- v53: My Metrics — SLA/Vendor Selection Speed nhóm A
-- (1) is_self_initiated: đánh dấu thread do chính Hiếu đăng (không phải người khác nhờ) — loại khỏi
--     hàng chờ duyệt tự động (Hiếu chỉ tự chấm KPI cho request từ NGƯỜI KHÁC), nhưng vẫn lưu lại để
--     audit + cho phép "Vẫn tính case này" (override thủ công) khi có ngoại lệ thật.
-- (2) hieu_note: ghi chú tự do gắn vào 1 case (mọi trạng thái) để đối chiếu sau này — không ảnh hưởng
--     số KPI, sửa được kể cả sau khi quý đã khoá (chỉ là metadata).
ALTER TABLE okr_lark_events ADD COLUMN IF NOT EXISTS is_self_initiated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE okr_lark_events ADD COLUMN IF NOT EXISTS hieu_note TEXT;

CREATE INDEX IF NOT EXISTS idx_okr_lark_events_self_initiated ON okr_lark_events (quarter, is_self_initiated) WHERE is_self_initiated = TRUE;
