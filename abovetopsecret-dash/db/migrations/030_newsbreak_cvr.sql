-- Add CVR column to newsbreak tables
ALTER TABLE newsbreak_ads_today ADD COLUMN IF NOT EXISTS cvr NUMERIC(10,6) DEFAULT 0;
ALTER TABLE newsbreak_ads_archive ADD COLUMN IF NOT EXISTS cvr NUMERIC(10,6) DEFAULT 0;
