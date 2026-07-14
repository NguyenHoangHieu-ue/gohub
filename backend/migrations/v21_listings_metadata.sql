-- v21_listings_metadata.sql — Item 4 (Phase 1): tách mô tả listings vào JSONB `metadata`
-- CHẠY TRONG SUPABASE SQL EDITOR. An toàn/additive: chỉ THÊM cột + backfill, GIỮ cột phẳng cũ (rollback được).
-- Reads chưa đổi (Phase 2 sẽ chuyển sang metadata rồi mới DROP cột cũ).
-- ⚠️ Chạy migration NÀY TRƯỚC khi merge sync.py mới lên main (sync ghi cột metadata).

-- 1) Thêm cột metadata
ALTER TABLE listings ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

-- 2) Backfill: gom MỌI cột KHÔNG-nòng-cốt của row hiện tại vào metadata.
--    Core giữ dạng cột: khóa + status/tenant + phân loại + listing_name (dùng để search/hiển thị).
UPDATE listings l SET metadata = (
  to_jsonb(l.*)
    - 'listing_code' - 'reference_product_code' - 'tenant' - 'status'
    - 'listing_type' - 'type_of_sim' - 'product_type' - 'category_code'
    - 'listing_name_en' - 'listing_name_vn'
    - 'metadata' - 'synced_at'
);

-- 3) GIN index để query field trong metadata khi cần
CREATE INDEX IF NOT EXISTS idx_listings_metadata ON listings USING GIN (metadata);

-- Kiểm tra nhanh sau khi chạy:
--   SELECT listing_code, jsonb_object_keys(metadata) FROM listings LIMIT 5;
--   SELECT count(*) FROM listings WHERE metadata = '{}';   -- kỳ vọng 0 (đã backfill hết)
