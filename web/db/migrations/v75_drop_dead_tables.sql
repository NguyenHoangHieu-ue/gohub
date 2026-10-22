-- v75: bỏ bảng Supabase không còn dùng (kiểm 2026-10-22: không code nào đọc/ghi, hoặc chỉ còn trong danh sách mô tả).
-- KHÔNG dùng CASCADE: bảng nào còn view/khoá ngoại phụ thuộc thì lệnh báo lỗi và giữ nguyên.
-- Dữ liệu còn lại (ncc_bc 6 dòng; inventory_items, inventory_snapshots, vendor_balances mỗi bảng 1 dòng) đã sao lưu ở Hieu/backup-bang-cu-2026-10-22.json.

-- (chạy riêng trước để biết dung lượng DB; gói Hobby giới hạn 500MB)
-- SELECT pg_size_pretty(pg_database_size(current_database()));
-- SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;

DROP TABLE IF EXISTS analytics_messages;            -- chatbot BI cũ, 0 dòng; xoá trước analytics_conversations
DROP TABLE IF EXISTS analytics_conversations;       -- 0 dòng
DROP TABLE IF EXISTS analytics_feedbacks;           -- 0 dòng
DROP TABLE IF EXISTS analytics_scheduled_messages;  -- đã thay bằng lark_scheduled_messages, 0 dòng
DROP TABLE IF EXISTS analytics_report_cache;        -- 0 dòng, không code đọc
DROP TABLE IF EXISTS ca_thread_log;                 -- Cà Thread đã gỡ ở s238, 0 dòng
DROP TABLE IF EXISTS inventory_items;               -- đã thay bằng inventory_plan_* / inventory_po (v42)
DROP TABLE IF EXISTS inventory_snapshots;
DROP TABLE IF EXISTS vendor_balances;
DROP TABLE IF EXISTS ncc_bc;                        -- catalog BC cũ, không code đọc

NOTIFY pgrst, 'reload schema';
