-- 019_tiktok_ads.sql — TikTok ad metrics tables

CREATE TABLE IF NOT EXISTS tiktok_ads_today (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  advertiser_id TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  adgroup_id TEXT,
  adgroup_name TEXT,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  spend NUMERIC(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_value NUMERIC(12,2) DEFAULT 0,
  ctr NUMERIC(10,6) DEFAULT 0,
  cpc NUMERIC(12,4) DEFAULT 0,
  cpm NUMERIC(12,4) DEFAULT 0,
  cpa NUMERIC(12,4) DEFAULT 0,
  roas NUMERIC(10,4) DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  video_watched_2s INTEGER DEFAULT 0,
  video_watched_6s INTEGER DEFAULT 0,
  video_watched_100pct INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_tiktok_ads_today_user ON tiktok_ads_today(user_id);

CREATE TABLE IF NOT EXISTS tiktok_ads_archive (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  archived_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ad_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiktok_ads_archive_user ON tiktok_ads_archive(user_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_ads_archive_date ON tiktok_ads_archive(archived_date);
