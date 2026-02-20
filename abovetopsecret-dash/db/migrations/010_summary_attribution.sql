-- Summary Dashboard + Attribution enhancements
-- Migration 010

CREATE TABLE IF NOT EXISTS user_favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  metric_key TEXT NOT NULL,
  display_name TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, metric_key)
);

CREATE TABLE IF NOT EXISTS custom_metric_cards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  metric_key TEXT NOT NULL,
  label TEXT NOT NULL,
  format TEXT DEFAULT 'number',
  position INTEGER DEFAULT 0,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, metric_key)
);

CREATE TABLE IF NOT EXISTS attribution_config (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  default_model TEXT DEFAULT 'last_click',
  lookback_window INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS attribution_touchpoints (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  order_id TEXT NOT NULL,
  touchpoint_index INTEGER DEFAULT 0,
  channel TEXT NOT NULL,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  is_first_touch BOOLEAN DEFAULT false,
  is_last_touch BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_touchpoints_order ON attribution_touchpoints(order_id);
CREATE INDEX IF NOT EXISTS idx_touchpoints_user ON attribution_touchpoints(user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(user_id);
