-- Sprint 3: End-to-End Data Flow & Multi-Pixel fixes
-- Add missing UTM columns to cc_orders_today
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255);
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(255);
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255);
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS utm_term VARCHAR(255);
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cc_orders_utm_source ON cc_orders_today(utm_source);
CREATE INDEX IF NOT EXISTS idx_cc_orders_utm_medium ON cc_orders_today(utm_medium);

-- Fix app_settings: change from PK on key alone to composite unique on (key, user_id)
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS id SERIAL;
-- Only add PK if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_pkey' AND conrelid = 'app_settings'::regclass) THEN
    ALTER TABLE app_settings ADD PRIMARY KEY (id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_settings_key_user
  ON app_settings (key, COALESCE(user_id, -1));

-- Webhook tokens table (for user-scoped webhook URLs)
CREATE TABLE IF NOT EXISTS webhook_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token VARCHAR(64) NOT NULL UNIQUE,
  source VARCHAR(50) NOT NULL,
  label VARCHAR(100),
  active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_tokens_token ON webhook_tokens(token);

-- Pixel configs table (multi-pixel per funnel page)
CREATE TABLE IF NOT EXISTS pixel_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  funnel_page VARCHAR(50) NOT NULL,
  pixel_type VARCHAR(20) NOT NULL DEFAULT 'javascript',
  enabled BOOLEAN NOT NULL DEFAULT true,
  track_pageviews BOOLEAN NOT NULL DEFAULT true,
  track_conversions BOOLEAN NOT NULL DEFAULT true,
  track_upsells BOOLEAN NOT NULL DEFAULT false,
  custom_code TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, funnel_page)
);
