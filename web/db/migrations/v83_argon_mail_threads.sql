-- v83 (s241): Sổ trạng thái mail theo thread (plan docs/plans/tro-ly-hop-nhat.md, P1b).
-- Mỗi luồng thư (thread) một dòng: Chờ mình / Chờ đối tác / Xong / Bỏ qua (thư tự động). Chỉ ĐỌC mail, không gửi gì.
-- Bảng mới hoàn toàn → chạy lúc nào cũng an toàn (code cũ không đụng tới).

CREATE TABLE IF NOT EXISTS argon_mail_threads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT        NOT NULL,
  thread_id       TEXT        NOT NULL,
  subject         TEXT        NOT NULL DEFAULT '',
  counterparty    TEXT        NOT NULL DEFAULT '',           -- người/đối tác phía bên kia (từ thư cuối của họ, hoặc người nhận thư cuối của mình)
  last_message_id TEXT        NOT NULL DEFAULT '',           -- đổi = có thư mới → phân loại lại
  last_at         TIMESTAMPTZ,
  last_from_me    BOOLEAN     NOT NULL DEFAULT false,
  message_count   INTEGER     NOT NULL DEFAULT 1,
  status          TEXT        NOT NULL DEFAULT 'waiting_me' CHECK (status IN ('waiting_me','waiting_partner','done','ignored')),
  status_by       TEXT        NOT NULL DEFAULT 'auto' CHECK (status_by IN ('auto','manual')),   -- manual: anh tự đổi, giữ tới khi có thư mới
  summary         TEXT        NOT NULL DEFAULT '',
  next_action     TEXT        NOT NULL DEFAULT '',
  nudged_at       TIMESTAMPTZ,                               -- lần nhắc Lark gần nhất (mỗi luồng không nhắc quá 1 lần / 3 ngày)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (username, thread_id)
);
CREATE INDEX IF NOT EXISTS idx_argon_mail_threads_status ON argon_mail_threads (username, status, last_at DESC);
ALTER TABLE argon_mail_threads ENABLE ROW LEVEL SECURITY;   -- chỉ service_role truy cập

NOTIFY pgrst, 'reload schema';
