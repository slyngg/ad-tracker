-- Add conversion tracking columns to fb_ads_today
-- Meta API returns purchase value via action_values field
ALTER TABLE fb_ads_today ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0;
ALTER TABLE fb_ads_today ADD COLUMN IF NOT EXISTS conversion_value NUMERIC(12,2) DEFAULT 0;
