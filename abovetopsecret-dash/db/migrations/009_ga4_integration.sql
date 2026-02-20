-- GA4 Integration tables
-- Migration 009: Google Analytics 4 data storage

CREATE TABLE IF NOT EXISTS ga4_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE NOT NULL,
  source TEXT,
  medium TEXT,
  campaign TEXT,
  device_category TEXT,
  country TEXT,
  city TEXT,
  landing_page TEXT,
  sessions INTEGER DEFAULT 0,
  users_count INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  pageviews INTEGER DEFAULT 0,
  pages_per_session NUMERIC(10,2) DEFAULT 0,
  avg_session_duration NUMERIC(10,2) DEFAULT 0,
  bounce_rate NUMERIC(5,4) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,4) DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  add_to_carts INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, source, medium, device_category, country, landing_page)
);

CREATE TABLE IF NOT EXISTS ga4_pages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE NOT NULL,
  page_path TEXT NOT NULL,
  page_title TEXT,
  sessions INTEGER DEFAULT 0,
  pageviews INTEGER DEFAULT 0,
  unique_pageviews INTEGER DEFAULT 0,
  avg_time_on_page NUMERIC(10,2) DEFAULT 0,
  exits INTEGER DEFAULT 0,
  exit_rate NUMERIC(5,4) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,4) DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, page_path)
);

CREATE TABLE IF NOT EXISTS ga4_search_queries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE NOT NULL,
  search_term TEXT NOT NULL,
  search_count INTEGER DEFAULT 0,
  search_exits INTEGER DEFAULT 0,
  search_refinements INTEGER DEFAULT 0,
  avg_search_depth NUMERIC(10,2) DEFAULT 0,
  conversions_after_search INTEGER DEFAULT 0,
  revenue_after_search NUMERIC(12,2) DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, search_term)
);

CREATE TABLE IF NOT EXISTS ga4_funnel_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE NOT NULL,
  event_name TEXT NOT NULL,
  event_count INTEGER DEFAULT 0,
  unique_users INTEGER DEFAULT 0,
  device_category TEXT,
  source TEXT,
  medium TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, event_name, device_category, source)
);

CREATE TABLE IF NOT EXISTS ga4_products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  date DATE NOT NULL,
  product_name TEXT NOT NULL,
  product_id TEXT,
  product_category TEXT,
  quantity INTEGER DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  views INTEGER DEFAULT 0,
  add_to_carts INTEGER DEFAULT 0,
  purchases INTEGER DEFAULT 0,
  cart_to_purchase_rate NUMERIC(5,4) DEFAULT 0,
  avg_price NUMERIC(10,2) DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, product_id)
);

CREATE INDEX IF NOT EXISTS idx_ga4_sessions_user_date ON ga4_sessions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_ga4_sessions_source ON ga4_sessions(source, medium);
CREATE INDEX IF NOT EXISTS idx_ga4_pages_user_date ON ga4_pages(user_id, date);
CREATE INDEX IF NOT EXISTS idx_ga4_search_user_date ON ga4_search_queries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_ga4_funnel_user_date ON ga4_funnel_events(user_id, date);
CREATE INDEX IF NOT EXISTS idx_ga4_products_user_date ON ga4_products(user_id, date);
