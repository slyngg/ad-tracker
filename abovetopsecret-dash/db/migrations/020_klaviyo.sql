-- 020_klaviyo.sql — Klaviyo profiles, lists, campaigns, and flow metrics

CREATE TABLE IF NOT EXISTS klaviyo_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  klaviyo_id TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  name TEXT,
  location JSONB DEFAULT '{}',
  total_clv NUMERIC(12,2) DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  last_event_date TIMESTAMPTZ,
  properties JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, klaviyo_id)
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_profiles_user ON klaviyo_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_profiles_email ON klaviyo_profiles(email);

CREATE TABLE IF NOT EXISTS klaviyo_lists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL,
  name TEXT,
  type TEXT,
  profile_count INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, list_id)
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_lists_user ON klaviyo_lists(user_id);

CREATE TABLE IF NOT EXISTS klaviyo_campaigns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  name TEXT,
  type TEXT,
  status TEXT,
  subject_line TEXT,
  send_time TIMESTAMPTZ,
  sent_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  bounce_count INTEGER DEFAULT 0,
  unsub_count INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  open_rate NUMERIC(8,4) DEFAULT 0,
  click_rate NUMERIC(8,4) DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_user ON klaviyo_campaigns(user_id);

CREATE TABLE IF NOT EXISTS klaviyo_flow_metrics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  metric_name TEXT NOT NULL,
  event_count INTEGER DEFAULT 0,
  unique_profiles INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date, metric_name)
);

CREATE INDEX IF NOT EXISTS idx_klaviyo_flow_metrics_user ON klaviyo_flow_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_flow_metrics_date ON klaviyo_flow_metrics(date);
