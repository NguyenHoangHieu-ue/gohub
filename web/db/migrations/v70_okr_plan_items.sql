-- v70: Kế hoạch quý tự đo (tab My Metrics › Kế hoạch quý, s227 — plan my-metrics-plan-quy.md mốc M3).
-- Mỗi dòng = 1 việc trong kế hoạch quý: loại việc + phạm vi + mốc đầu + mục tiêu + hạn. Số thực tế KHÔNG lưu ở đây —
-- server tự tính mỗi lần xem (lib/okr-plan.ts) từ doanh thu theo SKU (tab Thị trường) và vendor_quotes.
CREATE TABLE IF NOT EXISTS okr_plan_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter     TEXT        NOT NULL,                      -- "Q4-2026"
  kind        TEXT        NOT NULL,                      -- vendor_share | market_gm | market_datapool | vendor_dependency | new_markets | new_skus | quotes_review | manual
  title       TEXT        NOT NULL,
  scope       JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- { country?: string, vendor?: string }
  baseline    NUMERIC,                                   -- NULL = tự lấy số quý trước
  target      NUMERIC,                                   -- NULL với kind = manual
  due_date    DATE,                                      -- NULL = cuối quý
  done        BOOLEAN     NOT NULL DEFAULT false,        -- tick tay (bắt buộc với manual; việc đo số tự "Đạt" khi tới mục tiêu)
  dropped     BOOLEAN     NOT NULL DEFAULT false,        -- bỏ việc (giữ lịch sử, không tính)
  note        TEXT,
  sort        INT         NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_okr_plan_items_quarter ON okr_plan_items (quarter, sort, created_at);
ALTER TABLE okr_plan_items ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
