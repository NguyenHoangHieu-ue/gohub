-- v60: Realtime cho Docs/Notes/Questions (Tổ Gấu) — đề xuất E, roadmap audit s196+5
--
-- chat_messages đã có Realtime từ v55 (fix tin nhắn người khác không tự hiện). 3 bảng còn lại của Tổ Gấu
-- vẫn chỉ poll 20s (s196+1) — thêm vào publication để member khác thấy tài liệu/ghi chú/câu hỏi mới
-- NGAY thay vì chờ tới 20s. Giữ nguyên poll 20s làm lưới an toàn (đúng tiền lệ chat_messages — publication
-- thiếu không throw lỗi gì, chỉ im lặng không nhận event).
ALTER PUBLICATION supabase_realtime ADD TABLE chat_docs;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_questions;
