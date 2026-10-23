-- v80 (s240) — Bỏ 2 bảng bản sao chiếm nhiều dung lượng Supabase (~57MB ước tính, chưa tính index).
-- CHỈ CHẠY SAU KHI code đã lên production (main) VÀ đã kiểm hai tab chạy đúng:
--   * CS Troubleshoot: ticket đọc từ kho Turso `cs_tickets` (đã backfill 35,5 nghìn ticket từ bảng này — KIỂM `done:true` và số khớp trước khi xoá;
--     Lark Base chỉ giữ ~5 tháng nên bảng Supabase này đang là nơi duy nhất còn lịch sử tới 10/2025 nếu chưa backfill)
--   * Khách B2B: đọc thẳng gohub_dw/dim_customer (lib/b2b-customers.ts)
-- Khách B2B còn nguyên ở gohub_dw. Xoá bảng là không hoàn tác được ở Supabase.

DROP TABLE IF EXISTS lark_cs_tickets;
DROP TABLE IF EXISTS b2b_customers_cache;

-- Sau khi chạy: Supabase Dashboard → Settings → Database xem dung lượng; nếu muốn lấy lại chỗ nhanh hơn có thể chạy VACUUM (không bắt buộc).
-- Reload schema cache của PostgREST (Settings → API → Reload) để API không còn thấy 2 bảng cũ.
