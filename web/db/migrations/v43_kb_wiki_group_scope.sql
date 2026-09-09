-- v43: gộp Note + Knowledge Base vào Tổ Gấu — phân quyền tài liệu chính thức theo group (chat_groups).
-- Additive, không phá dữ liệu cũ: mọi trang Wiki hiện có mặc định visibility_mode='all'
-- (= hành vi hiện tại, hiện cho mọi group) cho tới khi admin/creator chủ động thu hẹp.
-- is_hidden giữ nguyên nghĩa cũ (draft/nháp, chỉ admin/creator thấy) — lớp group này chỉ áp dụng
-- SAU khi trang đã publish (is_hidden=false).

ALTER TABLE kb_wiki_pages
  ADD COLUMN IF NOT EXISTS visibility_mode TEXT NOT NULL DEFAULT 'all'; -- 'all' | 'groups'

CREATE TABLE IF NOT EXISTS kb_wiki_page_groups (
  page_id  UUID NOT NULL REFERENCES kb_wiki_pages(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES chat_groups(id)   ON DELETE CASCADE,
  PRIMARY KEY (page_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_kb_wiki_page_groups_group ON kb_wiki_page_groups (group_id);
