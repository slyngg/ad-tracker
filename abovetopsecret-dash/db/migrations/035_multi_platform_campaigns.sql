BEGIN;

-- Add platform column to campaign_drafts
ALTER TABLE campaign_drafts
  ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'meta';

-- Add TikTok-specific IDs alongside existing Meta columns
ALTER TABLE campaign_drafts
  ADD COLUMN IF NOT EXISTS tiktok_campaign_id TEXT;

ALTER TABLE campaign_adsets
  ADD COLUMN IF NOT EXISTS tiktok_adgroup_id TEXT;

ALTER TABLE campaign_ads
  ADD COLUMN IF NOT EXISTS tiktok_ad_id TEXT;

-- Add creative library reference to campaign_ads (pick from library)
ALTER TABLE campaign_ads
  ADD COLUMN IF NOT EXISTS library_creative_id INTEGER REFERENCES ad_creatives(id) ON DELETE SET NULL;

-- Webhook API keys for external creative ingestion
CREATE TABLE IF NOT EXISTS webhook_api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Creative Webhook',
  scopes TEXT[] NOT NULL DEFAULT '{creatives.write}',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_api_keys_hash ON webhook_api_keys(key_hash);

COMMIT;
