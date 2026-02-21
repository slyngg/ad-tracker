-- 022_brand_configs.sql — Multi-brand config support

CREATE TABLE IF NOT EXISTS brand_configs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand_name TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  brand_colors TEXT DEFAULT '',
  tone_of_voice TEXT DEFAULT '',
  target_audience TEXT DEFAULT '',
  usp TEXT DEFAULT '',
  guidelines TEXT DEFAULT '',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brand_configs_user ON brand_configs(user_id);

-- Add brand_config_id FK to accounts and offers
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS brand_config_id INTEGER REFERENCES brand_configs(id) ON DELETE SET NULL;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS brand_config_id INTEGER REFERENCES brand_configs(id) ON DELETE SET NULL;

-- Migrate existing brand_vault data into a "Default" brand_config per user
INSERT INTO brand_configs (user_id, name, is_default,
  brand_name, logo_url, brand_colors, tone_of_voice, target_audience, usp, guidelines)
SELECT
  bv.user_id,
  'Default',
  true,
  COALESCE(MAX(CASE WHEN bv.asset_type = 'brand_name' THEN bv.asset_value END), ''),
  COALESCE(MAX(CASE WHEN bv.asset_type = 'logo_url' THEN bv.asset_value END), ''),
  COALESCE(MAX(CASE WHEN bv.asset_type = 'brand_colors' THEN bv.asset_value END), ''),
  COALESCE(MAX(CASE WHEN bv.asset_type = 'tone_of_voice' THEN bv.asset_value END), ''),
  COALESCE(MAX(CASE WHEN bv.asset_type = 'target_audience' THEN bv.asset_value END), ''),
  COALESCE(MAX(CASE WHEN bv.asset_type = 'usp' THEN bv.asset_value END), ''),
  COALESCE(MAX(CASE WHEN bv.asset_type = 'guidelines' THEN bv.asset_value END), '')
FROM brand_vault bv
GROUP BY bv.user_id
ON CONFLICT DO NOTHING;
