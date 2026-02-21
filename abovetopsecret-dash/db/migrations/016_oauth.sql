-- 016_oauth.sql — Add OAuth support columns to integration_configs

ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS oauth_state TEXT;
ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS oauth_state_expires_at TIMESTAMPTZ;
ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT;
ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS token_refreshed_at TIMESTAMPTZ;
ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS connection_method TEXT DEFAULT 'manual';
ALTER TABLE integration_configs ADD COLUMN IF NOT EXISTS scopes TEXT[];

CREATE INDEX IF NOT EXISTS idx_integration_oauth_state ON integration_configs(oauth_state) WHERE oauth_state IS NOT NULL;
