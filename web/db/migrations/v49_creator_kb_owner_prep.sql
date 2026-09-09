-- v49: chuẩn bị schema cho multi-tenant KB (mỗi nhân viên 1 KB riêng, tự học riêng) — CHƯA bật tính năng,
-- chỉ thêm cột nullable để sau này không phải retroactive-migrate 1 bảng đang có data thật.
-- NULL = hành vi hiện tại (KB chung, không phân biệt owner). Code KHÔNG đọc/ghi cột này ở s195.
ALTER TABLE creator_kb ADD COLUMN IF NOT EXISTS owner_username TEXT;
ALTER TABLE chatbot_learning_log ADD COLUMN IF NOT EXISTS target_owner_username TEXT;

COMMENT ON COLUMN creator_kb.owner_username IS
  'NULL = KB chung (hành vi hiện tại). Set sau này khi bật KB riêng/nhân viên (multi-tenant) — chưa dùng (s195).';
COMMENT ON COLUMN chatbot_learning_log.target_owner_username IS
  'NULL = học vào KB chung (hành vi hiện tại). Set sau này khi mỗi nhân viên có KB tự học riêng — chưa dùng (s195).';
