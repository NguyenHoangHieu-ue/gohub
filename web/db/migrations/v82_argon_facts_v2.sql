-- v82 (s241): Sổ sự việc v2 (plan docs/plans/tro-ly-hop-nhat.md, P1) — chống nhầm sự việc cũ với sự việc mới thay thế.
-- Chỉ THÊM cột (có mặc định), code cũ vẫn chạy bình thường → chạy lúc nào cũng an toàn; code mới (staging/main) cần cột này mới lưu được.
--   attribute/value : chủ thể–thuộc tính–giá trị (vd subject "Thái Lan Daily", attribute "giá vốn/GB", value "3.5 HKD")
--   source_date     : ngày của TIN (ngày thư/tài liệu), dùng để biết tin nào mới hơn — khác ngày hệ thống nạp
--   recorded_at     : lúc hệ thống biết (trục thời gian thứ hai); expired_at: lúc hệ thống thôi coi sự việc là đúng (bị thay thế / bỏ)
--   change_note     : "giá vốn/GB: 3.0 HKD → 3.5 HKD" khi sự việc này thay thế một sự việc cũ
--   needs_review    : thay đổi quan trọng (giá/ngừng bán/đổi mạng) hoặc xung đột với bản anh đã sửa tay → chờ anh xác nhận

ALTER TABLE argon_facts
  ADD COLUMN IF NOT EXISTS attribute    TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS value        TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_date  DATE,
  ADD COLUMN IF NOT EXISTS recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expired_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS change_note  TEXT        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN     NOT NULL DEFAULT false;

UPDATE argon_facts SET recorded_at = created_at WHERE recorded_at > created_at;
UPDATE argon_facts SET expired_at = updated_at WHERE status IN ('superseded', 'rejected', 'expired') AND expired_at IS NULL;
UPDATE argon_facts SET source_date = created_at::date WHERE source_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_argon_facts_review ON argon_facts (username) WHERE needs_review;

NOTIFY pgrst, 'reload schema';
