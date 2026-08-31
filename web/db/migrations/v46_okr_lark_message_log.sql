-- v46: real-time Lark message capture cho My Metrics SLA/Vendor Speed bot.
--
-- TRƯỚC (s167): cron quét REST API 1 group Lark cấu hình tay (chat_id) mỗi ngày — 0 case cả quý vì
-- (a) giới hạn đúng 1 group trong khi request/vendor-query thật xảy ra rải rác nhiều group khác nhau,
-- (b) chỉ chạy định kỳ nên có thể bỏ sót nếu group bận.
--
-- NAY (s173, học theo mẫu Hieu/lark-sla-bot): webhook Lark ĐÃ CÓ sẵn (api/lark/events) nhận MỌI tin
-- nhắn ở MỌI group bot có mặt, real-time. Bảng này lưu MỖI tin nhắn liên quan Hiếu (Hiếu tự gửi HOẶC
-- được @mention) ngay khi Lark bắn event — không giới hạn group, không bỏ sót do lịch quét.
--
-- Dùng để PHÁT HIỆN thread nào đáng chú ý (rẻ, tức thời, mọi group); nội dung ĐẦY ĐỦ của thread (root +
-- toàn bộ reply) vẫn hydrate qua Lark REST API 1 lần/thread khi cần phân loại (xem
-- lib/lark-thread-scan.ts fetchThreadsFromCapturedLog) — bảng KHÔNG phải bản sao toàn bộ nội dung thread.
CREATE TABLE IF NOT EXISTS okr_lark_message_log (
  message_id         TEXT        PRIMARY KEY,
  thread_id          TEXT        NOT NULL,   -- root_id nếu là reply, ngược lại = message_id
  parent_id          TEXT,
  chat_id            TEXT        NOT NULL,
  chat_type          TEXT,                   -- p2p | group | thread
  sender_open_id     TEXT        NOT NULL,
  is_self_post       BOOLEAN     NOT NULL DEFAULT FALSE,
  mentioned_open_ids TEXT[]      NOT NULL DEFAULT '{}',
  message_type       TEXT,
  content             TEXT,                  -- preview thô, chỉ để debug/audit — KHÔNG dùng để classify
  create_time_ms      BIGINT      NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_okr_lark_msg_log_thread       ON okr_lark_message_log (thread_id);
CREATE INDEX IF NOT EXISTS idx_okr_lark_msg_log_create_time  ON okr_lark_message_log (create_time_ms);
