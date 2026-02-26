BEGIN;

-- Add NewsBreak-specific campaign IDs alongside existing Meta/TikTok columns
ALTER TABLE campaign_drafts
  ADD COLUMN IF NOT EXISTS newsbreak_campaign_id TEXT;

ALTER TABLE campaign_adsets
  ADD COLUMN IF NOT EXISTS newsbreak_adgroup_id TEXT;

ALTER TABLE campaign_ads
  ADD COLUMN IF NOT EXISTS newsbreak_ad_id TEXT;

COMMIT;
