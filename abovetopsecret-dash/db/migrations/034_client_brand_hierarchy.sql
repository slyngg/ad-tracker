-- 034_client_brand_hierarchy.sql — Client > Brand > Accounts hierarchy

BEGIN;

CREATE TABLE IF NOT EXISTS clients (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  logo_url   TEXT DEFAULT '',
  notes      TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);

ALTER TABLE brand_configs
  ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_brand_configs_client_id ON brand_configs(client_id);

COMMIT;
