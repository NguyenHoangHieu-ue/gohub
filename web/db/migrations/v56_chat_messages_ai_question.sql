-- v56: Đánh dấu tin nhắn nào là câu hỏi gửi cho Gấu Tổ AI (Tổ Gấu)
--
-- Hiếu yêu cầu: phân biệt được tin nào là "hỏi bot" với tin chat bình thường — trước đây câu hỏi hỏi AI
-- (sau khi s196+1 bắt đầu lưu nó thành 1 chat_messages thật) hiện y hệt tin nhắn thường, không có gì
-- đánh dấu là nó đã được gửi cho AI xử lý.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_ai_question boolean NOT NULL DEFAULT false;
