-- Migration v19: Supabase mirror của dim_customer từ gohub_dw.
-- raw_data JSONB lưu toàn bộ row → không bị ảnh hưởng khi gohub_dw đổi schema.
-- sync bằng /api/admin/sync-dim-customer (POST).

CREATE TABLE IF NOT EXISTS dim_customer_cache (
  code TEXT PRIMARY KEY,                       -- khớp với f.customer_code trong fact tables
  name TEXT,                                   -- tên khách hàng
  price_list_name TEXT,                        -- phân loại tier: STRATEGIC/VIP/GOLD/SILVER
  currency_code TEXT,                          -- VND hoặc USD (region: VN/US)
  status TEXT,                                 -- Active/Inactive
  organization TEXT,
  organization_code TEXT,
  customer_group_code TEXT,
  raw_data JSONB,                              -- toàn bộ row gốc từ gohub_dw (schema-agnostic)
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dim_customer_cache_name ON dim_customer_cache (name);
CREATE INDEX IF NOT EXISTS idx_dim_customer_cache_price_list ON dim_customer_cache (price_list_name);
CREATE INDEX IF NOT EXISTS idx_dim_customer_cache_synced ON dim_customer_cache (synced_at);
