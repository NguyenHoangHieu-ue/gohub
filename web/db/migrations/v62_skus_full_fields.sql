-- v62: Bảng skus — đồng bộ đủ field theo response GoHub API /skus THẬT (verify qua debug dump trực tiếp
-- API 2026-09-22, xem docs/session_summary.txt). API đổi tên `expirations` → `vendor_expirations` từ
-- lâu (code cũ vẫn đọc field cũ nên luôn NULL) và trả thêm `sku_ref`/`parents`/`data`/`speed`/
-- `data_plan`/`topup_timing` mà trước giờ bị bỏ sót hoàn toàn, không lưu vào Supabase.
--
-- 5 cột sau CHƯA từng tồn tại trong bảng này (verify DB thật) nên không cần DROP — cố tình KHÔNG thêm
-- theo yêu cầu Hiếu: original_cost, reference_cost_vnd, final_cogs_included_vat_vnd, final_cogs_usd,
-- wr_group.

ALTER TABLE skus ADD COLUMN IF NOT EXISTS sku_ref            TEXT;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS parents            TEXT;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS data               NUMERIC;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS speed              NUMERIC;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS vendor_expirations TEXT;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS data_plan          TEXT;
ALTER TABLE skus ADD COLUMN IF NOT EXISTS topup_timing       TEXT;

-- Cột cũ `expirations` không còn được code ghi (đổi hẳn sang `vendor_expirations`) — xoá cho gọn,
-- luôn NULL từ trước tới giờ nên không mất dữ liệu thật.
ALTER TABLE skus DROP COLUMN IF EXISTS expirations;

-- Sau khi chạy: Supabase Dashboard → Database → API → Reload schema (hoặc NOTIFY pgrst, 'reload schema';)
