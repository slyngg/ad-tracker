-- 021_accounts_offers.sql
-- Multi-Account & Multi-Offer Architecture
-- Adds accounts and offers as first-class entities with filtering across the stack.

BEGIN;

-- ============================================================
-- 1. accounts table
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'meta',  -- meta, tiktok, google, shopify, etc.
  platform_account_id TEXT,                    -- e.g. act_123456
  access_token_encrypted TEXT,                 -- per-account token (optional, overrides integration_configs)
  currency      TEXT NOT NULL DEFAULT 'USD',
  timezone      TEXT NOT NULL DEFAULT 'America/New_York',
  status        TEXT NOT NULL DEFAULT 'active', -- active, paused, archived
  color         TEXT DEFAULT '#3b82f6',         -- hex color for UI badges
  icon          TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(user_id, platform, status);

-- ============================================================
-- 2. offers table
-- ============================================================
CREATE TABLE IF NOT EXISTS offers (
  id                  SERIAL PRIMARY KEY,
  account_id          INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  offer_type          TEXT NOT NULL DEFAULT 'product',  -- product, bundle, subscription, lead, service
  identifier          TEXT,                              -- external SKU / funnel ID
  utm_campaign_match  TEXT,                              -- wildcard pattern: "offer-*-cold"
  campaign_name_match TEXT,                              -- wildcard pattern for FB campaign name matching
  product_ids         JSONB DEFAULT '[]'::jsonb,         -- array of product/SKU ids
  cogs                NUMERIC(10,2) DEFAULT 0,
  shipping_cost       NUMERIC(10,2) DEFAULT 0,
  handling_cost       NUMERIC(10,2) DEFAULT 0,
  gateway_fee_pct     NUMERIC(5,4) DEFAULT 0,            -- e.g. 0.029 for 2.9%
  gateway_fee_flat    NUMERIC(10,2) DEFAULT 0,            -- e.g. 0.30
  target_cpa          NUMERIC(10,2),
  target_roas         NUMERIC(10,4),
  status              TEXT NOT NULL DEFAULT 'active',     -- active, paused, archived
  color               TEXT DEFAULT '#8b5cf6',
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offers_user_id ON offers(user_id);
CREATE INDEX IF NOT EXISTS idx_offers_account_id ON offers(account_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(user_id, status);

-- ============================================================
-- 3. Add nullable account_id / offer_id to existing tables
-- ============================================================

-- fb_ads_today
ALTER TABLE fb_ads_today ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fb_ads_today_account_id ON fb_ads_today(account_id);

-- fb_ads_archive
ALTER TABLE fb_ads_archive ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fb_ads_archive_account_id ON fb_ads_archive(account_id);

-- cc_orders_today
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cc_orders_today_account_id ON cc_orders_today(account_id);
CREATE INDEX IF NOT EXISTS idx_cc_orders_today_offer_id ON cc_orders_today(offer_id);

-- orders_archive
ALTER TABLE orders_archive ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE orders_archive ADD COLUMN IF NOT EXISTS offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_archive_account_id ON orders_archive(account_id);

-- cc_upsells_today
ALTER TABLE cc_upsells_today ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cc_upsells_today_account_id ON cc_upsells_today(account_id);

-- automation_rules
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_automation_rules_account_id ON automation_rules(account_id);

-- cost_settings
ALTER TABLE cost_settings ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE cost_settings ADD COLUMN IF NOT EXISTS offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cost_settings_account_id ON cost_settings(account_id);

-- pixel_configs
ALTER TABLE pixel_configs ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE pixel_configs ADD COLUMN IF NOT EXISTS offer_id INTEGER REFERENCES offers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_configs_account_id ON pixel_configs(account_id);

-- webhook_tokens
ALTER TABLE webhook_tokens ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_tokens_account_id ON webhook_tokens(account_id);

-- Conditional: tables that may not exist yet (ad_creatives, creative_metrics_daily)
DO $$ BEGIN
  ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_ad_creatives_account_id ON ad_creatives(account_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tiktok_ads_today ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_tiktok_ads_today_account_id ON tiktok_ads_today(account_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tiktok_ads_archive ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_tiktok_ads_archive_account_id ON tiktok_ads_archive(account_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- 4. Auto-create "Default Account" for existing users with data
-- ============================================================
INSERT INTO accounts (user_id, name, platform, status, color, notes)
SELECT DISTINCT u.id, 'Default Account', 'meta', 'active', '#3b82f6', 'Auto-created during multi-account migration'
FROM users u
WHERE EXISTS (SELECT 1 FROM fb_ads_today WHERE user_id = u.id)
   OR EXISTS (SELECT 1 FROM cc_orders_today WHERE user_id = u.id)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. Backfill existing rows to point to default account
-- ============================================================
UPDATE fb_ads_today t SET account_id = a.id
FROM accounts a
WHERE t.user_id = a.user_id AND a.name = 'Default Account' AND t.account_id IS NULL;

UPDATE cc_orders_today t SET account_id = a.id
FROM accounts a
WHERE t.user_id = a.user_id AND a.name = 'Default Account' AND t.account_id IS NULL;

DO $$ BEGIN
  UPDATE cc_upsells_today t SET account_id = a.id
  FROM accounts a
  WHERE t.user_id = a.user_id AND a.name = 'Default Account' AND t.account_id IS NULL;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

COMMIT;
