BEGIN;

-- Add campaign/adset status and adset daily budget to daily ad snapshot tables

ALTER TABLE fb_ads_today ADD COLUMN IF NOT EXISTS campaign_status TEXT;
ALTER TABLE fb_ads_today ADD COLUMN IF NOT EXISTS adset_status TEXT;
ALTER TABLE fb_ads_today ADD COLUMN IF NOT EXISTS adset_daily_budget NUMERIC;

ALTER TABLE tiktok_ads_today ADD COLUMN IF NOT EXISTS campaign_status TEXT;
ALTER TABLE tiktok_ads_today ADD COLUMN IF NOT EXISTS adset_status TEXT;
ALTER TABLE tiktok_ads_today ADD COLUMN IF NOT EXISTS adset_daily_budget NUMERIC;

ALTER TABLE newsbreak_ads_today ADD COLUMN IF NOT EXISTS campaign_status TEXT;
ALTER TABLE newsbreak_ads_today ADD COLUMN IF NOT EXISTS adset_status TEXT;
ALTER TABLE newsbreak_ads_today ADD COLUMN IF NOT EXISTS adset_daily_budget NUMERIC;

COMMIT;
