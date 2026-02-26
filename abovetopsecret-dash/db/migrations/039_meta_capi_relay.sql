-- Meta Conversions API (CAPI) relay — "Sonar" equivalent
-- Sends enriched first-party pixel events back to Meta server-side

-- Per-account CAPI configuration
CREATE TABLE IF NOT EXISTS capi_relay_configs (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pixel_id      TEXT NOT NULL,                        -- Meta pixel ID (e.g. "123456789")
  access_token_encrypted TEXT,                        -- Encrypted Meta access token (if standalone; otherwise uses integration_configs)
  use_integration_token  BOOLEAN DEFAULT true,        -- Pull token from integration_configs.meta
  enabled       BOOLEAN DEFAULT true,
  event_filter  JSONB DEFAULT '[]'::jsonb,            -- Optional: restrict to specific event names (empty = all)
  test_event_code TEXT,                               -- Meta test event code for debugging
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, pixel_id)
);

-- Relay log — audit trail for events sent to Meta CAPI
CREATE TABLE IF NOT EXISTS capi_relay_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL,
  config_id     INTEGER NOT NULL REFERENCES capi_relay_configs(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL,                        -- References pixel_events_v2.event_id
  event_name    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',      -- pending, sent, failed
  http_status   INTEGER,
  meta_response JSONB,
  error_message TEXT,
  sent_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_capi_relay_configs_user ON capi_relay_configs(user_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_capi_relay_log_user_status ON capi_relay_log(user_id, status);
CREATE INDEX IF NOT EXISTS idx_capi_relay_log_event_id ON capi_relay_log(event_id);
CREATE INDEX IF NOT EXISTS idx_capi_relay_log_sent_at ON capi_relay_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_capi_relay_log_config ON capi_relay_log(config_id, sent_at DESC);
