-- v79: Sổ sự việc có hạn của Phòng Argon (plan docs/plans/argon-hub.md, bước 3).
-- Argon tự trích từ tài liệu/thread/mail vừa nạp: khuyến mãi, ngừng bán, sản phẩm mới, đổi giá, đổi mạng, chính sách, hạn chót.
-- Mỗi sự việc có hiệu lực từ–đến; cron đêm đánh dấu hết hạn, nhắc Lark trước hạn, gửi tóm tắt "đã ghi gì". Hiếu sửa/bỏ nếu sai.

CREATE TABLE IF NOT EXISTS argon_facts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username       TEXT        NOT NULL,
  type           TEXT        NOT NULL,                       -- khuyen_mai | ngung_ban | san_pham_moi | doi_gia | doi_mang | chinh_sach | han_chot | khac
  vendor         TEXT        NOT NULL DEFAULT '',
  subject        TEXT        NOT NULL DEFAULT '',            -- đối tượng: sản phẩm / thị trường / mạng
  summary        TEXT        NOT NULL,
  evidence       TEXT        NOT NULL DEFAULT '',            -- câu nguyên văn làm bằng chứng
  effective_from DATE,
  expires_at     DATE,
  status         TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','superseded','rejected')),
  origin         TEXT        NOT NULL DEFAULT 'auto' CHECK (origin IN ('auto','manual')),
  edited         BOOLEAN     NOT NULL DEFAULT false,         -- Hiếu đã sửa tay → lần trích lại không ghi đè
  source_id      UUID        REFERENCES argon_sources(id) ON DELETE SET NULL,
  source_name    TEXT        NOT NULL DEFAULT '',
  superseded_by  UUID,
  remind_days    INTEGER     NOT NULL DEFAULT 3,
  reminded_at    TIMESTAMPTZ,
  announced_at   TIMESTAMPTZ,                                -- đã đưa vào tin tóm tắt "đã ghi gì" gửi Hiếu
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_argon_facts_user_status ON argon_facts (username, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_argon_facts_source ON argon_facts (source_id) WHERE source_id IS NOT NULL;
ALTER TABLE argon_facts ENABLE ROW LEVEL SECURITY;   -- chỉ service_role truy cập

NOTIFY pgrst, 'reload schema';
