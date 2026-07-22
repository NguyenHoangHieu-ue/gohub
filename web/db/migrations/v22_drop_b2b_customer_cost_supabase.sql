-- Migration v22: Drop b2b_customer_cost_monthly khỏi Supabase.
-- Bảng này đã chuyển sang Turso (gohub-intel).
-- Chạy trong Supabase SQL Editor.

DROP TABLE IF EXISTS b2b_customer_cost_monthly;
