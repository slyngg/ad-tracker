-- 027: Meta Ad Library (Spy) — cache, search tracking, trends
-- 3 new tables + alter followed_brands

-- ── ad_library_cache ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_library_cache (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meta_ad_id TEXT NOT NULL,
  page_id TEXT,
  page_name TEXT,
  ad_creative_bodies JSONB DEFAULT '[]'::JSONB,
  ad_creative_link_titles JSONB DEFAULT '[]'::JSONB,
  ad_creative_link_descriptions JSONB DEFAULT '[]'::JSONB,
  ad_creative_link_captions JSONB DEFAULT '[]'::JSONB,
  ad_snapshot_url TEXT,
  impressions_lower BIGINT,
  impressions_upper BIGINT,
  spend_lower NUMERIC(12,2),
  spend_upper NUMERIC(12,2),
  currency TEXT,
  ad_delivery_start TIMESTAMPTZ,
  ad_delivery_stop TIMESTAMPTZ,
  ad_creation_time TIMESTAMPTZ,
  publisher_platforms JSONB DEFAULT '[]'::JSONB,
  bylines TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_library_cache_user ON ad_library_cache(user_id);
CREATE INDEX idx_ad_library_cache_page ON ad_library_cache(page_id);
CREATE INDEX idx_ad_library_cache_meta_ad ON ad_library_cache(meta_ad_id);
CREATE UNIQUE INDEX idx_ad_library_cache_unique ON ad_library_cache(user_id, meta_ad_id);

-- ── ad_library_searches ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_library_searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  search_type TEXT NOT NULL DEFAULT 'keyword',
  search_terms TEXT,
  page_id TEXT,
  country TEXT,
  filters JSONB DEFAULT '{}'::JSONB,
  results_count INTEGER DEFAULT 0,
  api_calls_used INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_library_searches_user ON ad_library_searches(user_id);
CREATE INDEX idx_ad_library_searches_time ON ad_library_searches(created_at);

-- ── ad_library_trends ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_library_trends (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  active_ad_count INTEGER DEFAULT 0,
  new_ads INTEGER DEFAULT 0,
  stopped_ads INTEGER DEFAULT 0,
  themes JSONB DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ad_library_trends_user ON ad_library_trends(user_id);
CREATE INDEX idx_ad_library_trends_page ON ad_library_trends(page_id);
CREATE UNIQUE INDEX idx_ad_library_trends_unique ON ad_library_trends(user_id, page_id, date);

-- ── Alter followed_brands ──────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'followed_brands') THEN
    ALTER TABLE followed_brands
      ADD COLUMN IF NOT EXISTS ad_library_sync_enabled BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS ad_library_last_synced TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ad_library_ad_count INTEGER DEFAULT 0;
  END IF;
END $$;
