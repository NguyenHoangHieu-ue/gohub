-- v18: Trend snapshots cho Gấu Pro Content Intelligence (Wave 1)
-- Chạy 1 lần trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS trend_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  date        TEXT NOT NULL,                       -- YYYY-MM-DD (ngày thu thập)
  platform    TEXT NOT NULL DEFAULT 'web',         -- 'tiktok' | 'google' | 'youtube' | 'news'
  category    TEXT NOT NULL DEFAULT 'travel_sim',  -- 'travel_sim' | 'competitor' | 'travel' | 'general'
  summary     TEXT NOT NULL,                       -- AI-generated summary từ webSearch
  topics      JSONB DEFAULT '[]',                  -- [{title, hashtags?, url?}]
  raw_sources JSONB DEFAULT '[]',                  -- [{title, url}] groundingChunks từ Gemini
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trend_snap_date     ON trend_snapshots(date DESC);
CREATE INDEX IF NOT EXISTS idx_trend_snap_platform ON trend_snapshots(platform);
CREATE INDEX IF NOT EXISTS idx_trend_snap_category ON trend_snapshots(category);
