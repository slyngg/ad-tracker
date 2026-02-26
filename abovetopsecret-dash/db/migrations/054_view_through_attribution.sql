BEGIN;

-- Impression log — aggregated impression data from ad platforms
CREATE TABLE IF NOT EXISTS pixel_impressions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        VARCHAR(30) NOT NULL,  -- meta, tiktok, google, newsbreak
  campaign_id     VARCHAR(255),
  campaign_name   TEXT,
  adset_id        VARCHAR(255),
  ad_id           VARCHAR(255),
  impressions     INTEGER NOT NULL DEFAULT 0,
  reach           INTEGER NOT NULL DEFAULT 0,
  frequency       NUMERIC(6,2) NOT NULL DEFAULT 0,
  date            DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform, campaign_id, adset_id, ad_id, date)
);
CREATE INDEX IF NOT EXISTS idx_pi_user_date ON pixel_impressions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_pi_platform ON pixel_impressions(user_id, platform, date);

-- View-through attribution results
CREATE TABLE IF NOT EXISTS view_through_results (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visitor_id          INTEGER REFERENCES pixel_visitors(id) ON DELETE SET NULL,
  order_id            VARCHAR(255) NOT NULL,
  platform            VARCHAR(30) NOT NULL,
  campaign_id         VARCHAR(255),
  revenue             NUMERIC(12,2) NOT NULL DEFAULT 0,
  view_probability    NUMERIC(10,6) NOT NULL DEFAULT 0,  -- modeled probability this view led to conversion
  attributed_revenue  NUMERIC(12,2) NOT NULL DEFAULT 0,  -- revenue * view_probability
  model_version       VARCHAR(20) NOT NULL DEFAULT 'v1',
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(visitor_id, order_id, platform, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_vtr_user ON view_through_results(user_id, computed_at);
CREATE INDEX IF NOT EXISTS idx_vtr_platform ON view_through_results(user_id, platform);

-- Combined attribution view (clicks + views)
-- Add view_through columns to attribution summary
ALTER TABLE pixel_attribution_summary ADD COLUMN IF NOT EXISTS view_through_conversions NUMERIC(10,4) NOT NULL DEFAULT 0;
ALTER TABLE pixel_attribution_summary ADD COLUMN IF NOT EXISTS view_through_revenue NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMIT;
