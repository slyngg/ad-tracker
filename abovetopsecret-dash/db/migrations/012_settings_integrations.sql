-- Settings + Integrations expansion
-- Migration 012

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  invited_by INTEGER REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'viewer',
  permissions JSONB DEFAULT '{}',
  invite_email TEXT,
  invite_token TEXT,
  invite_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  schedule TEXT NOT NULL,
  delivery_channel TEXT NOT NULL,
  delivery_config JSONB DEFAULT '{}',
  report_config JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brand_vault (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  asset_type TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  asset_value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, asset_type, asset_key)
);

CREATE TABLE IF NOT EXISTS global_filters (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  filter_config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS integration_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  platform TEXT NOT NULL,
  credentials JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  status TEXT DEFAULT 'disconnected',
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  customer_email TEXT NOT NULL,
  customer_identifier TEXT,
  status TEXT DEFAULT 'pending',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  deletion_log JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_dictionary (
  id SERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  data_type TEXT,
  description TEXT,
  example_value TEXT,
  category TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(table_name, column_name)
);

CREATE INDEX IF NOT EXISTS idx_team_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_user ON scheduled_reports(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_brand_user ON brand_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_user ON integration_configs(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_deletion_user ON data_deletion_requests(user_id, status);
