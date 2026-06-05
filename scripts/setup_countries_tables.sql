-- Chạy trong Supabase SQL Editor
-- https://supabase.com/dashboard/project/wfuigmfnfcijkvylrwzz/sql/new

CREATE TABLE IF NOT EXISTS ref_countries (
    code    TEXT PRIMARY KEY,   -- ISO 2-char country code (VN, US, ...)
    name    TEXT NOT NULL,      -- English name
    name_vn TEXT                -- Vietnamese name (optional)
);

CREATE TABLE IF NOT EXISTS ref_support_countries (
    code               TEXT PRIMARY KEY,  -- internal group code (000, 3HK, A10, ...)
    name               TEXT,              -- same as code (internal alias)
    support_country    TEXT,              -- EN description of countries in group
    support_country_vn TEXT,              -- VN description (optional)
    country_codes      TEXT               -- comma-separated ISO codes (VN, US, ...)
);
