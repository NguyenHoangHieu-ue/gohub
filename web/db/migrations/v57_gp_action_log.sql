-- v57: Nhật ký hành động Gấu Pro (audit trail)
--
-- Từ s195+2, mọi hành động ghi (bridge browser, Lark, KB) chạy Auto không cần duyệt — không có nơi
-- xem lại "Gấu Pro đã làm gì". Bảng này ghi mọi lời gọi tool có tác dụng phụ ra ngoài
-- (writeKnowledgeBase/approveLearning/rejectLearning/createLarkTask/updateLarkTask/sendLarkMessage/
-- controlMyBrowser/managePortalCredentials) — xem AUDITED_TOOLS trong creator/tools/dispatch.ts.
CREATE TABLE IF NOT EXISTS gp_action_log (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT,
  tool_name  TEXT NOT NULL,
  args       JSONB,
  ok         BOOLEAN NOT NULL DEFAULT true,
  summary    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gp_action_log_created_at ON gp_action_log (created_at DESC);
