-- 015_creative_analysis.sql
-- Full creative analysis workspace: ad creatives, AI tags, daily metrics, inspo, boards, snapshots

-- Ad creative assets pulled from ad platforms
CREATE TABLE IF NOT EXISTS ad_creatives (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  ad_id VARCHAR(255) NOT NULL,
  ad_name VARCHAR(500),
  adset_id VARCHAR(255),
  adset_name VARCHAR(255),
  campaign_id VARCHAR(255),
  campaign_name VARCHAR(255),
  creative_type VARCHAR(50),
  thumbnail_url TEXT,
  image_url TEXT,
  video_url TEXT,
  ad_copy TEXT,
  headline TEXT,
  cta_type VARCHAR(100),
  landing_page_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  first_seen DATE DEFAULT CURRENT_DATE,
  last_seen DATE DEFAULT CURRENT_DATE,
  status VARCHAR(50) DEFAULT 'active',
  UNIQUE(user_id, platform, ad_id)
);

-- AI-generated tags per creative (8 dimensions matching Motion's AI Tags)
CREATE TABLE IF NOT EXISTS creative_tags (
  id SERIAL PRIMARY KEY,
  creative_id INTEGER REFERENCES ad_creatives(id) ON DELETE CASCADE,
  asset_type VARCHAR(100),
  visual_format VARCHAR(100),
  hook_type VARCHAR(100),
  creative_angle VARCHAR(100),
  messaging_theme VARCHAR(100),
  talent_type VARCHAR(100),
  offer_type VARCHAR(100),
  cta_style VARCHAR(100),
  custom_tags JSONB DEFAULT '{}',
  ai_confidence DECIMAL(3,2) DEFAULT 0,
  tagged_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(creative_id)
);

-- Daily performance metrics per creative (synced from ad platform)
CREATE TABLE IF NOT EXISTS creative_metrics_daily (
  id SERIAL PRIMARY KEY,
  creative_id INTEGER REFERENCES ad_creatives(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  spend DECIMAL(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  revenue DECIMAL(12,2) DEFAULT 0,
  add_to_carts INTEGER DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  video_watches_25 INTEGER DEFAULT 0,
  video_watches_50 INTEGER DEFAULT 0,
  video_watches_75 INTEGER DEFAULT 0,
  video_watches_100 INTEGER DEFAULT 0,
  thumb_stop_rate DECIMAL(5,4) DEFAULT 0,
  hold_rate DECIMAL(5,4) DEFAULT 0,
  ctr DECIMAL(5,4) DEFAULT 0,
  cpc DECIMAL(10,2) DEFAULT 0,
  cpm DECIMAL(10,2) DEFAULT 0,
  cpa DECIMAL(10,2) DEFAULT 0,
  roas DECIMAL(10,4) DEFAULT 0,
  cvr DECIMAL(5,4) DEFAULT 0,
  synced_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(creative_id, date)
);

-- Saved creatives (Inspo library)
CREATE TABLE IF NOT EXISTS saved_creatives (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(50),
  brand_name VARCHAR(255),
  ad_id VARCHAR(255),
  thumbnail_url TEXT,
  video_url TEXT,
  ad_copy TEXT,
  headline TEXT,
  notes TEXT,
  tags JSONB DEFAULT '[]',
  saved_at TIMESTAMP DEFAULT NOW()
);

-- Creative boards (organize saved creatives into collections)
CREATE TABLE IF NOT EXISTS creative_boards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS board_items (
  id SERIAL PRIMARY KEY,
  board_id INTEGER REFERENCES creative_boards(id) ON DELETE CASCADE,
  saved_creative_id INTEGER REFERENCES saved_creatives(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(board_id, saved_creative_id)
);

-- Followed brands for competitor tracking
CREATE TABLE IF NOT EXISTS followed_brands (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  brand_name VARCHAR(255) NOT NULL,
  platform VARCHAR(50) DEFAULT 'meta',
  platform_page_id VARCHAR(255),
  last_synced_at TIMESTAMP,
  followed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, platform, platform_page_id)
);

-- Shareable report snapshots (public links, no auth required to view)
CREATE TABLE IF NOT EXISTS report_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  snapshot_token VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(500),
  report_type VARCHAR(100),
  report_config JSONB NOT NULL,
  snapshot_data JSONB,
  is_live BOOLEAN DEFAULT false,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_creatives_user_platform ON ad_creatives(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_creatives_user_status ON ad_creatives(user_id, status);
CREATE INDEX IF NOT EXISTS idx_creatives_campaign ON ad_creatives(user_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_creative_metrics_date ON creative_metrics_daily(creative_id, date);
CREATE INDEX IF NOT EXISTS idx_creative_metrics_creative_date ON creative_metrics_daily(date, creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_tags_types ON creative_tags(asset_type, visual_format, hook_type, creative_angle);
CREATE INDEX IF NOT EXISTS idx_saved_creatives_user ON saved_creatives(user_id);
CREATE INDEX IF NOT EXISTS idx_followed_brands_user ON followed_brands(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_token ON report_snapshots(snapshot_token);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON report_snapshots(user_id);
