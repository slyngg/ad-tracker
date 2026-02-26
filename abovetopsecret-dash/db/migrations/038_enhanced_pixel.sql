-- 037_enhanced_pixel.sql
-- Enhanced First-Party Pixel: Identity Graph, Sessions, Touchpoints
-- Modeled after Triple Whale's pixel architecture for first-party tracking

BEGIN;

-- ============================================================
-- 1. Site tokens — each user gets a public site ID for their pixel
-- ============================================================
CREATE TABLE IF NOT EXISTS pixel_sites (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_token    VARCHAR(32) NOT NULL UNIQUE,  -- e.g. "ODT-a1b2c3d4"
  domain        TEXT,                          -- e.g. "mystore.com"
  name          TEXT NOT NULL DEFAULT 'My Site',
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- cookie domain, session timeout, etc.
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pixel_sites_user ON pixel_sites(user_id);
CREATE INDEX IF NOT EXISTS idx_pixel_sites_token ON pixel_sites(site_token);

-- ============================================================
-- 2. Visitors — the identity graph core
-- ============================================================
CREATE TABLE IF NOT EXISTS pixel_visitors (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id         INTEGER REFERENCES pixel_sites(id) ON DELETE CASCADE,
  anonymous_id    VARCHAR(64) NOT NULL,         -- first-party cookie ID (generated client-side)
  -- Known identifiers (populated on conversion/identify call)
  email           VARCHAR(255),
  phone           VARCHAR(50),
  customer_id     VARCHAR(255),                 -- external CRM/checkout ID
  -- Device fingerprint signals
  fingerprint     VARCHAR(64),                  -- hash of device signals
  -- Merge tracking
  canonical_id    INTEGER REFERENCES pixel_visitors(id) ON DELETE SET NULL,  -- points to merged identity
  merged_at       TIMESTAMPTZ,
  -- Metadata
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_referrer  TEXT,
  first_landing   TEXT,
  total_sessions  INTEGER NOT NULL DEFAULT 0,
  total_events    INTEGER NOT NULL DEFAULT 0,
  total_revenue   NUMERIC(12,2) NOT NULL DEFAULT 0,
  properties      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- arbitrary user properties
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pixel_visitors_anon ON pixel_visitors(user_id, anonymous_id);
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_email ON pixel_visitors(user_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_phone ON pixel_visitors(user_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_customer ON pixel_visitors(user_id, customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_fingerprint ON pixel_visitors(user_id, fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_canonical ON pixel_visitors(canonical_id) WHERE canonical_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_visitors_last_seen ON pixel_visitors(user_id, last_seen_at);

-- ============================================================
-- 3. Sessions — individual browsing sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS pixel_sessions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visitor_id      INTEGER REFERENCES pixel_visitors(id) ON DELETE CASCADE,
  session_id      VARCHAR(64) NOT NULL,         -- generated client-side per session
  -- Traffic source
  referrer        TEXT,
  landing_page    TEXT,
  utm_source      VARCHAR(255),
  utm_medium      VARCHAR(255),
  utm_campaign    VARCHAR(255),
  utm_content     VARCHAR(255),
  utm_term        VARCHAR(255),
  -- Click IDs (all platforms)
  fbclid          VARCHAR(255),
  gclid           VARCHAR(255),
  ttclid          VARCHAR(255),
  sclid           VARCHAR(255),                 -- Snapchat
  msclkid         VARCHAR(255),                 -- Microsoft/Bing
  -- Device info
  device_type     VARCHAR(20),                  -- desktop, mobile, tablet
  browser         VARCHAR(50),
  os              VARCHAR(50),
  screen_width    INTEGER,
  screen_height   INTEGER,
  timezone        VARCHAR(50),
  language        VARCHAR(10),
  ip_address      INET,
  user_agent      TEXT,
  -- Session metrics
  page_count      INTEGER NOT NULL DEFAULT 0,
  event_count     INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  is_bounce       BOOLEAN NOT NULL DEFAULT true,
  has_conversion  BOOLEAN NOT NULL DEFAULT false,
  -- Timestamps
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pixel_sessions_sid ON pixel_sessions(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_pixel_sessions_visitor ON pixel_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_pixel_sessions_started ON pixel_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_pixel_sessions_fbclid ON pixel_sessions(user_id, fbclid) WHERE fbclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_sessions_gclid ON pixel_sessions(user_id, gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pixel_sessions_ttclid ON pixel_sessions(user_id, ttclid) WHERE ttclid IS NOT NULL;

-- ============================================================
-- 4. Enhanced pixel events — full e-commerce taxonomy
-- ============================================================
CREATE TABLE IF NOT EXISTS pixel_events_v2 (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visitor_id      INTEGER REFERENCES pixel_visitors(id) ON DELETE SET NULL,
  session_id      VARCHAR(64),
  -- Event data
  event_name      VARCHAR(100) NOT NULL,        -- PageView, ViewContent, AddToCart, InitiateCheckout, Purchase, Lead, etc.
  event_category  VARCHAR(50),                  -- page, ecommerce, engagement, custom
  page_url        TEXT,
  page_title      VARCHAR(500),
  page_referrer   TEXT,
  -- E-commerce data (for purchase/cart events)
  order_id        VARCHAR(255),
  revenue         NUMERIC(12,2),
  currency        VARCHAR(3) DEFAULT 'USD',
  product_ids     JSONB,                        -- array of product IDs
  product_names   JSONB,                        -- array of product names
  quantity        INTEGER,
  -- Click IDs at time of event
  fbclid          VARCHAR(255),
  gclid           VARCHAR(255),
  ttclid          VARCHAR(255),
  -- Custom properties
  properties      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Deduplication
  event_id        VARCHAR(64),                  -- client-generated unique event ID
  -- Timestamps
  client_ts       TIMESTAMPTZ,                  -- timestamp from client
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pev2_user_created ON pixel_events_v2(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pev2_visitor ON pixel_events_v2(visitor_id);
CREATE INDEX IF NOT EXISTS idx_pev2_session ON pixel_events_v2(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_pev2_event_name ON pixel_events_v2(user_id, event_name, created_at);
CREATE INDEX IF NOT EXISTS idx_pev2_order ON pixel_events_v2(user_id, order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pev2_dedup ON pixel_events_v2(user_id, event_id) WHERE event_id IS NOT NULL;

-- ============================================================
-- 5. Touchpoints — ad click attribution trail
-- ============================================================
CREATE TABLE IF NOT EXISTS pixel_touchpoints (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visitor_id      INTEGER REFERENCES pixel_visitors(id) ON DELETE CASCADE,
  session_id      VARCHAR(64),
  -- Which ad platform
  platform        VARCHAR(30) NOT NULL,          -- meta, google, tiktok, snapchat, bing, organic, direct, referral
  click_id        VARCHAR(255),                  -- the actual fbclid/gclid/ttclid value
  -- Campaign info from UTMs
  utm_source      VARCHAR(255),
  utm_medium      VARCHAR(255),
  utm_campaign    VARCHAR(255),
  utm_content     VARCHAR(255),
  utm_term        VARCHAR(255),
  -- Conversion info
  converted       BOOLEAN NOT NULL DEFAULT false,
  order_id        VARCHAR(255),
  revenue         NUMERIC(12,2),
  -- Timestamp
  touched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_touchpoints_visitor ON pixel_touchpoints(visitor_id, touched_at);
CREATE INDEX IF NOT EXISTS idx_touchpoints_user_date ON pixel_touchpoints(user_id, touched_at);
CREATE INDEX IF NOT EXISTS idx_touchpoints_click ON pixel_touchpoints(user_id, click_id) WHERE click_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_touchpoints_platform ON pixel_touchpoints(user_id, platform, touched_at);

-- ============================================================
-- 6. Identity merge log — audit trail for merges
-- ============================================================
CREATE TABLE IF NOT EXISTS pixel_identity_merges (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_visitor  INTEGER NOT NULL REFERENCES pixel_visitors(id) ON DELETE CASCADE,
  target_visitor  INTEGER NOT NULL REFERENCES pixel_visitors(id) ON DELETE CASCADE,
  merge_reason    VARCHAR(50) NOT NULL,          -- email_match, phone_match, fingerprint_match, customer_id_match
  merged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merges_user ON pixel_identity_merges(user_id, merged_at);

COMMIT;
