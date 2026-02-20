-- Customer Retention + Creative Analysis
-- Migration 011

CREATE TABLE IF NOT EXISTS rfm_segments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  segment_name TEXT NOT NULL,
  segment_label TEXT,
  recency_min INTEGER,
  recency_max INTEGER,
  frequency_min INTEGER,
  frequency_max INTEGER,
  monetary_min NUMERIC(12,2),
  monetary_max NUMERIC(12,2),
  customer_count INTEGER DEFAULT 0,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  avg_order_value NUMERIC(10,2) DEFAULT 0,
  color TEXT DEFAULT '#3b82f6',
  is_preset BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_rfm (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  recency_days INTEGER,
  frequency INTEGER,
  monetary NUMERIC(12,2),
  rfm_score TEXT,
  segment_id INTEGER REFERENCES rfm_segments(id),
  first_order_date DATE,
  last_order_date DATE,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, customer_email)
);

CREATE TABLE IF NOT EXISTS repeat_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  cohort_month DATE NOT NULL,
  order_number INTEGER NOT NULL,
  customer_count INTEGER DEFAULT 0,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, cohort_month, order_number)
);

CREATE TABLE IF NOT EXISTS creative_performance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  platform TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  creative_type TEXT,
  headline TEXT,
  body_text TEXT,
  image_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  spend NUMERIC(12,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  ctr NUMERIC(8,4) DEFAULT 0,
  cpc NUMERIC(10,2) DEFAULT 0,
  cpa NUMERIC(10,2) DEFAULT 0,
  roas NUMERIC(10,4) DEFAULT 0,
  date DATE NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_rfm_user ON customer_rfm(user_id, segment_id);
CREATE INDEX IF NOT EXISTS idx_repeat_user ON repeat_purchases(user_id, cohort_month);
CREATE INDEX IF NOT EXISTS idx_creative_user_date ON creative_performance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_creative_platform ON creative_performance(platform, ad_id);
