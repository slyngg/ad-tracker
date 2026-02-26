-- 041_pixel_attribution.sql
-- Multi-touch attribution engine tables for pixel touchpoint data

BEGIN;

-- ============================================================
-- 1. Attribution Results — computed credit per touchpoint per order
-- ============================================================
CREATE TABLE IF NOT EXISTS pixel_attribution_results (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visitor_id          INTEGER REFERENCES pixel_visitors(id) ON DELETE SET NULL,
  touchpoint_id       INTEGER NOT NULL REFERENCES pixel_touchpoints(id) ON DELETE CASCADE,
  order_id            VARCHAR(255) NOT NULL,
  revenue             NUMERIC(12,2) NOT NULL DEFAULT 0,
  model               VARCHAR(20) NOT NULL,  -- first_click, last_click, linear, time_decay, position_based
  credit              NUMERIC(10,6) NOT NULL DEFAULT 0,  -- fraction 0.0..1.0
  attributed_revenue  NUMERIC(12,2) NOT NULL DEFAULT 0,  -- revenue * credit
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(touchpoint_id, order_id, model)
);
CREATE INDEX IF NOT EXISTS idx_par_user_model ON pixel_attribution_results(user_id, model, computed_at);
CREATE INDEX IF NOT EXISTS idx_par_order ON pixel_attribution_results(user_id, order_id);
CREATE INDEX IF NOT EXISTS idx_par_visitor ON pixel_attribution_results(visitor_id);

-- ============================================================
-- 2. Attribution Summary — aggregated by day / campaign / platform
-- ============================================================
CREATE TABLE IF NOT EXISTS pixel_attribution_summary (
  id                      BIGSERIAL PRIMARY KEY,
  user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                    DATE NOT NULL,
  model                   VARCHAR(20) NOT NULL,
  platform                VARCHAR(30),
  utm_source              VARCHAR(255),
  utm_medium              VARCHAR(255),
  utm_campaign            VARCHAR(255),
  utm_content             VARCHAR(255),
  attributed_conversions  NUMERIC(10,4) NOT NULL DEFAULT 0,
  attributed_revenue      NUMERIC(12,2) NOT NULL DEFAULT 0,
  touchpoints             INTEGER NOT NULL DEFAULT 0,
  unique_visitors         INTEGER NOT NULL DEFAULT 0,
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pas_user_model_date ON pixel_attribution_summary(user_id, model, date);
CREATE INDEX IF NOT EXISTS idx_pas_platform ON pixel_attribution_summary(user_id, model, platform, date);
CREATE INDEX IF NOT EXISTS idx_pas_campaign ON pixel_attribution_summary(user_id, model, utm_campaign, date);

COMMIT;
