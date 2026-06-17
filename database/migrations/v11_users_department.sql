-- v11_users_department.sql
-- Thêm cột department vào users để hỗ trợ RBAC theo phòng ban
-- Chạy trong Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'none';

COMMENT ON COLUMN users.department IS 'Phòng ban: all | sales | product | tech | finance';
