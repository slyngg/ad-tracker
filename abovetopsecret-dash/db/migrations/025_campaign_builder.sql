-- 025: Campaign Builder — draft → publish pipeline for Meta campaigns
-- 5 new tables for campaign creation, ad sets, ads, templates, and media uploads

-- ── campaign_drafts ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_drafts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'OUTCOME_TRAFFIC',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validating', 'publishing', 'published', 'failed', 'archived')),
  special_ad_categories JSONB DEFAULT '[]'::JSONB,
  config JSONB DEFAULT '{}'::JSONB,
  meta_campaign_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_drafts_user ON campaign_drafts(user_id);
CREATE INDEX idx_campaign_drafts_status ON campaign_drafts(status);
CREATE INDEX idx_campaign_drafts_account ON campaign_drafts(account_id);

-- ── campaign_adsets ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_adsets (
  id SERIAL PRIMARY KEY,
  draft_id INTEGER NOT NULL REFERENCES campaign_drafts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  targeting JSONB DEFAULT '{}'::JSONB,
  budget_type TEXT NOT NULL DEFAULT 'daily'
    CHECK (budget_type IN ('daily', 'lifetime')),
  budget_cents INTEGER NOT NULL DEFAULT 2000
    CHECK (budget_cents >= 100),
  bid_strategy TEXT DEFAULT 'LOWEST_COST_WITHOUT_CAP',
  schedule_start TIMESTAMPTZ,
  schedule_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'publishing', 'published', 'failed')),
  meta_adset_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_adsets_draft ON campaign_adsets(draft_id);

-- ── campaign_ads ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_ads (
  id SERIAL PRIMARY KEY,
  adset_id INTEGER NOT NULL REFERENCES campaign_adsets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  creative_config JSONB DEFAULT '{}'::JSONB,
  generated_creative_id INTEGER REFERENCES generated_creatives(id) ON DELETE SET NULL,
  media_upload_id INTEGER,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'publishing', 'published', 'failed')),
  meta_ad_id TEXT,
  meta_creative_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_ads_adset ON campaign_ads(adset_id);

-- ── campaign_templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  targeting JSONB DEFAULT '{}'::JSONB,
  budget_config JSONB DEFAULT '{}'::JSONB,
  creative_config JSONB DEFAULT '{}'::JSONB,
  config JSONB DEFAULT '{}'::JSONB,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_templates_user ON campaign_templates(user_id);

-- ── campaign_media_uploads ─────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_media_uploads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  file_path TEXT,
  meta_image_hash TEXT,
  meta_video_id TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'processing', 'ready', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_media_user ON campaign_media_uploads(user_id);

-- Add foreign key for campaign_ads.media_upload_id now that table exists
ALTER TABLE campaign_ads
  ADD CONSTRAINT fk_campaign_ads_media
  FOREIGN KEY (media_upload_id) REFERENCES campaign_media_uploads(id) ON DELETE SET NULL;
