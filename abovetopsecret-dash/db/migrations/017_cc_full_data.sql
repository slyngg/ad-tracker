-- 017_cc_full_data.sql — CheckoutChamp full data tables (customers, transactions, purchases, products, campaigns)

CREATE TABLE IF NOT EXISTS cc_customers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  email TEXT,
  name TEXT,
  phone TEXT,
  address TEXT,
  total_orders INTEGER DEFAULT 0,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  first_order_date TIMESTAMPTZ,
  last_order_date TIMESTAMPTZ,
  customer_type TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_customers_user ON cc_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_customers_email ON cc_customers(email);

CREATE TABLE IF NOT EXISTS cc_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  order_id TEXT,
  customer_id TEXT,
  type TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  payment_method TEXT,
  processor TEXT,
  response TEXT,
  is_chargeback BOOLEAN DEFAULT false,
  transaction_date TIMESTAMPTZ,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_transactions_user ON cc_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_transactions_order ON cc_transactions(order_id);

CREATE TABLE IF NOT EXISTS cc_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purchase_id TEXT NOT NULL,
  order_id TEXT,
  customer_id TEXT,
  product_id TEXT,
  purchase_type TEXT,
  amount NUMERIC(12,2) DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  subscription_id TEXT,
  billing_cycle INTEGER,
  purchase_date TIMESTAMPTZ,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, purchase_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_purchases_user ON cc_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_purchases_order ON cc_purchases(order_id);

CREATE TABLE IF NOT EXISTS cc_products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT,
  sku TEXT,
  price NUMERIC(12,2) DEFAULT 0,
  cost NUMERIC(12,2) DEFAULT 0,
  category TEXT,
  is_subscription BOOLEAN DEFAULT false,
  rebill_days INTEGER,
  trial_days INTEGER,
  status TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_products_user ON cc_products(user_id);

CREATE TABLE IF NOT EXISTS cc_campaigns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  name TEXT,
  type TEXT,
  funnel_url TEXT,
  offer_name TEXT,
  product_ids JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_cc_campaigns_user ON cc_campaigns(user_id);
