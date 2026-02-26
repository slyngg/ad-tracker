-- 040_google_enhanced_conversions.sql
-- Google Enhanced Conversions relay via GA4 Measurement Protocol
-- Sends enriched first-party pixel events to Google server-side

BEGIN;

-- ============================================================
-- 1. Relay configs — per-user Google GA4 Measurement Protocol config
-- ============================================================
CREATE TABLE IF NOT EXISTS google_relay_configs (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measurement_id        VARCHAR(20) NOT NULL,                 -- GA4 Measurement ID (e.g. "G-XXXXXXX")
  api_secret            TEXT NOT NULL,                        -- GA4 Measurement Protocol API secret (encrypted)
  google_ads_customer_id VARCHAR(20),                         -- Optional: Google Ads customer ID (e.g. "123-456-7890")
  conversion_action_id  VARCHAR(100),                         -- Optional: Google Ads conversion action ID
  enabled               BOOLEAN NOT NULL DEFAULT true,
  event_filter          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Which events to relay (empty = all mapped events)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_relay_user_measurement ON google_relay_configs(user_id, measurement_id);
CREATE INDEX IF NOT EXISTS idx_google_relay_enabled ON google_relay_configs(user_id) WHERE enabled = true;

-- ============================================================
-- 2. Relay log — audit trail of events sent to Google
-- ============================================================
CREATE TABLE IF NOT EXISTS google_relay_log (
  id                BIGSERIAL PRIMARY KEY,
  config_id         INTEGER NOT NULL REFERENCES google_relay_configs(id) ON DELETE CASCADE,
  event_id          BIGINT REFERENCES pixel_events_v2(id) ON DELETE SET NULL,
  event_name        VARCHAR(100) NOT NULL,
  ga4_event         VARCHAR(100) NOT NULL,                    -- mapped GA4 event name
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending, sent, failed, skipped
  google_response   JSONB,                                    -- raw Google API response
  error_message     TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_google_relay_log_config ON google_relay_log(config_id, created_at);
CREATE INDEX IF NOT EXISTS idx_google_relay_log_event ON google_relay_log(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_google_relay_log_status ON google_relay_log(config_id, status) WHERE status = 'failed';

COMMIT;
