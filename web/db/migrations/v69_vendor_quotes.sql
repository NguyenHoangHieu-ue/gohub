-- v69: Kho báo giá vendor đang chào (tab Thị trường & Báo giá › So giá vendor, s225).
-- Mỗi dòng = 1 lần vendor gửi báo giá (ảnh/PDF/Word/Excel/text). AI đọc ra danh sách gói, Hiếu duyệt/sửa rồi lưu vào `items`.
-- File gốc lưu Supabase Storage bucket riêng tư `vendor-quotes` (code tự tạo bucket), đường dẫn ghi ở `files`.
CREATE TABLE IF NOT EXISTS vendor_quotes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor      TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'reviewing' CHECK (status IN ('reviewing','accepted','rejected')),
  quote_date  DATE,
  currency    TEXT        NOT NULL DEFAULT 'USD',
  moq         TEXT,
  note        TEXT,
  -- [{ name, countries: ["JP",...], market_code, plan: Daily|Fixed|Unlimited, data_gb, days, price_esim, price_sim, has_call, note }]
  items       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- [{ path, name, mime, size }]
  files       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendor_quotes_status ON vendor_quotes (status, created_at DESC);
ALTER TABLE vendor_quotes ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role (server) đọc/ghi được.

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
