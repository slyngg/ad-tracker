-- Add campaign_id column to fb_ads_today (was available from Meta API but not stored)
ALTER TABLE fb_ads_today ADD COLUMN IF NOT EXISTS campaign_id VARCHAR(255);

-- Index for fast campaign lookups by name and ID
CREATE INDEX IF NOT EXISTS idx_fb_ads_campaign_id ON fb_ads_today(user_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_fb_ads_campaign_name ON fb_ads_today(user_id, campaign_name);

-- Also add indexes for name-based lookups on adsets (for operator AI name resolution)
CREATE INDEX IF NOT EXISTS idx_fb_ads_adset_name ON fb_ads_today(user_id, ad_set_name);
CREATE INDEX IF NOT EXISTS idx_tiktok_ads_campaign_name ON tiktok_ads_today(user_id, campaign_name);
CREATE INDEX IF NOT EXISTS idx_tiktok_ads_adgroup_name ON tiktok_ads_today(user_id, adgroup_name);
