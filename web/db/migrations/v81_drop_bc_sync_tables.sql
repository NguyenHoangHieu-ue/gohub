-- v81 (s241) — Bỏ 5 bảng bản sao catalog BC Datapool (cron bc-sync + trang BC Datapool cũ đã gỡ).
-- CHỈ CHẠY SAU KHI code gỡ đã merge lên production (main) — trước đó production vẫn còn trang/route đọc các bảng này.
DROP TABLE IF EXISTS bc_sync_log;
DROP TABLE IF EXISTS bc_balance_log;
DROP TABLE IF EXISTS bc_prices;
DROP TABLE IF EXISTS bc_products;
DROP TABLE IF EXISTS bc_countries;
