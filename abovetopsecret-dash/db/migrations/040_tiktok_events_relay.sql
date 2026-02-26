-- 039_tiktok_events_relay.sql
-- TikTok Events API relay: server-side event forwarding (like Meta CAPI for TikTok)

BEGIN;

-- ============================================================
-- 1. Relay configs — per-user TikTok Events API configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS tiktok_relay_configs (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tiktok_pixel_id   VARCHAR(100) NOT NULL,           -- TikTok pixel ID (event_source_id)
  access_token_ref  VARCHAR(20) NOT NULL DEFAULT 'oauth',  -- 'oauth' = use integration_configs token, or 'manual'
  access_token_enc  TEXT,                             -- encrypted manual access token (if not using oauth)
  enabled           BOOLEAN NOT NULL DEFAULT true,
  test_event_code   VARCHAR(100),                     -- optional test event code for TikTok Events Manager
  event_filter      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- which events to relay (empty = all mapped events)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tiktok_relay_user_pixel ON tiktok_relay_configs(user_id, tiktok_pixel_id);
CREATE INDEX IF NOT EXISTS idx_tiktok_relay_enabled ON tiktok_relay_configs(user_id) WHERE enabled = true;

-- ============================================================
-- 2. Relay log — audit trail of events sent to TikTok
-- ============================================================
CREATE TABLE IF NOT EXISTS tiktok_relay_log (
  id                BIGSERIAL PRIMARY KEY,
  config_id         INTEGER NOT NULL REFERENCES tiktok_relay_configs(id) ON DELETE CASCADE,
  event_id          BIGINT REFERENCES pixel_events_v2(id) ON DELETE SET NULL,
  event_name        VARCHAR(100) NOT NULL,
  tiktok_event      VARCHAR(100) NOT NULL,            -- mapped TikTok event name
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, sent, failed, skipped
  tiktok_response   JSONB,                            -- raw TikTok API response
  error_message     TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tiktok_relay_log_config ON tiktok_relay_log(config_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tiktok_relay_log_event ON tiktok_relay_log(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tiktok_relay_log_status ON tiktok_relay_log(config_id, status) WHERE status = 'failed';

COMMIT;
