-- 021_data_accuracy.sql — Data accuracy improvements
-- Adds is_test column, timezone support, normalization function,
-- fixes unique constraints for multi-tenant, and adds archive dedup.

-- ============================================================
-- 1. Add is_test column to cc_orders_today
-- ============================================================
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Index for filtering test orders
CREATE INDEX IF NOT EXISTS idx_cc_orders_is_test ON cc_orders_today(is_test) WHERE is_test = true;

-- ============================================================
-- 2. Add timezone to users table
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC';

-- ============================================================
-- 3. Create normalize_attribution_key function
-- Normalizes strings for reliable attribution matching:
-- lowercase, trim, collapse whitespace, decode URL entities
-- ============================================================
CREATE OR REPLACE FUNCTION normalize_attribution_key(input TEXT)
RETURNS TEXT AS $$
  SELECT LOWER(TRIM(
    REGEXP_REPLACE(
      REPLACE(REPLACE(REPLACE(COALESCE(input, ''), '%20', ' '), '+', ' '), '&amp;', '&'),
      '\s+', ' ', 'g'
    )
  ));
$$ LANGUAGE sql IMMUTABLE;

-- ============================================================
-- 4. Fix unique constraints for multi-tenant safety
-- The original constraints don't include user_id, which means
-- different users can't have orders/ads with the same IDs.
-- ============================================================

-- cc_orders_today: drop old UNIQUE(order_id), add UNIQUE(user_id, order_id)
-- Note: PostgreSQL UNIQUE allows multiple NULLs, so we also add a partial index
-- for legacy rows where user_id IS NULL.
DO $$ BEGIN
  BEGIN
    ALTER TABLE cc_orders_today DROP CONSTRAINT IF EXISTS cc_orders_today_order_id_key;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE cc_orders_today ADD CONSTRAINT uq_cc_orders_user_order
      UNIQUE (user_id, order_id);
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;
END $$;
-- Partial unique index for legacy NULL user_id rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_cc_orders_null_user
  ON cc_orders_today (order_id) WHERE user_id IS NULL;

-- fb_ads_today: drop old UNIQUE(ad_set_id, ad_name), add UNIQUE(user_id, ad_set_id, ad_name)
DO $$ BEGIN
  BEGIN
    ALTER TABLE fb_ads_today DROP CONSTRAINT IF EXISTS fb_ads_today_ad_set_id_ad_name_key;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE fb_ads_today ADD CONSTRAINT uq_fb_ads_user_adset_ad
      UNIQUE (user_id, ad_set_id, ad_name);
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;
END $$;
-- Partial unique index for legacy NULL user_id rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_ads_null_user
  ON fb_ads_today (ad_set_id, ad_name) WHERE user_id IS NULL;

-- cc_upsells_today: add user_id to unique constraint
DO $$ BEGIN
  BEGIN
    ALTER TABLE cc_upsells_today DROP CONSTRAINT IF EXISTS cc_upsells_today_order_id_offer_name_key;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE cc_upsells_today ADD CONSTRAINT uq_cc_upsells_user_order_offer
      UNIQUE (user_id, order_id, offer_name);
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;
END $$;
-- Partial unique index for legacy NULL user_id rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_cc_upsells_null_user
  ON cc_upsells_today (order_id, offer_name) WHERE user_id IS NULL;

-- ============================================================
-- 5. Archive dedup: prevent same day archived twice
-- ============================================================

-- Add unique constraint on (user_id, archived_date, order_data->>'order_id') is too complex,
-- so we add a simpler constraint: prevent duplicate archive entries per user per date per source row.
-- For orders_archive: unique on (user_id, archived_date, (order_data->>'order_id'))
-- For fb_ads_archive: unique on (user_id, archived_date, (ad_data->>'ad_set_id'), (ad_data->>'ad_name'))
-- These use expression indexes since we can't put UNIQUE on JSONB subfields directly.

-- Instead, use a simpler approach: unique index on (user_id, archived_date, id_from_jsonb)
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_archive_dedup
  ON orders_archive (user_id, archived_date, (order_data->>'order_id'))
  WHERE order_data->>'order_id' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fb_ads_archive_dedup
  ON fb_ads_archive (user_id, archived_date, (ad_data->>'ad_set_id'), (ad_data->>'ad_name'))
  WHERE ad_data->>'ad_set_id' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tiktok_ads_archive_dedup
  ON tiktok_ads_archive (user_id, archived_date, (ad_data->>'ad_id'))
  WHERE ad_data->>'ad_id' IS NOT NULL;

-- ============================================================
-- 6. Add cost_settings columns for gateway fees and more cost types
-- ============================================================
-- Ensure cost_settings supports the full P&L formula:
-- cost_type can be: 'cogs', 'shipping', 'handling', 'gateway_fee_pct', 'gateway_fee_flat', 'fixed_monthly'
-- No schema change needed — existing cost_type VARCHAR(50) and cost_unit VARCHAR(20) handle this.
-- Just add an index for faster lookups.
CREATE INDEX IF NOT EXISTS idx_cost_settings_offer_type
  ON cost_settings(offer_name, cost_type);

-- ============================================================
-- 7. Indexes for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_cc_orders_status_user
  ON cc_orders_today(user_id, order_status);

CREATE INDEX IF NOT EXISTS idx_orders_archive_date_user
  ON orders_archive(archived_date, user_id);

CREATE INDEX IF NOT EXISTS idx_fb_ads_archive_date_user
  ON fb_ads_archive(archived_date, user_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_ads_archive_date_user
  ON tiktok_ads_archive(archived_date, user_id);

-- ============================================================
-- 8. TikTok safe-aggregation view
-- Pre-computed ratio columns (ctr, cpc, cpm, cpa, roas) must NEVER
-- be SUMmed or AVGed across ads. This view recomputes them from
-- component metrics so consumers can safely aggregate at any level.
-- ============================================================
CREATE OR REPLACE VIEW tiktok_campaign_summary AS
SELECT
  user_id,
  campaign_id,
  campaign_name,
  SUM(spend) AS spend,
  SUM(impressions) AS impressions,
  SUM(clicks) AS clicks,
  SUM(conversions) AS conversions,
  SUM(conversion_value) AS conversion_value,
  SUM(video_views) AS video_views,
  SUM(video_watched_2s) AS video_watched_2s,
  SUM(video_watched_6s) AS video_watched_6s,
  SUM(video_watched_100pct) AS video_watched_100pct,
  -- Recomputed ratios from components — safe to use after further aggregation
  CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::NUMERIC / SUM(impressions) ELSE 0 END AS ctr,
  CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc,
  CASE WHEN SUM(impressions) > 0 THEN (SUM(spend) / SUM(impressions)) * 1000 ELSE 0 END AS cpm,
  CASE WHEN SUM(conversions) > 0 THEN SUM(spend) / SUM(conversions) ELSE 0 END AS cpa,
  CASE WHEN SUM(spend) > 0 THEN SUM(conversion_value) / SUM(spend) ELSE 0 END AS roas
FROM tiktok_ads_today
GROUP BY user_id, campaign_id, campaign_name;
