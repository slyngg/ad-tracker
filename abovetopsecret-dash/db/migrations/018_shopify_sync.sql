-- 018_shopify_sync.sql — Shopify products and customers tables

CREATE TABLE IF NOT EXISTS shopify_products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  shopify_product_id TEXT NOT NULL,
  title TEXT,
  vendor TEXT,
  product_type TEXT,
  handle TEXT,
  status TEXT,
  tags TEXT,
  variants JSONB DEFAULT '[]',
  total_inventory INTEGER DEFAULT 0,
  image_url TEXT,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, shopify_product_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_products_user ON shopify_products(user_id);

CREATE TABLE IF NOT EXISTS shopify_customers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  shopify_customer_id TEXT NOT NULL,
  email TEXT,
  name TEXT,
  phone TEXT,
  orders_count INTEGER DEFAULT 0,
  total_spent NUMERIC(12,2) DEFAULT 0,
  city TEXT,
  province TEXT,
  country TEXT,
  tags TEXT,
  accepts_marketing BOOLEAN DEFAULT false,
  raw_data JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, shopify_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_shopify_customers_user ON shopify_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_email ON shopify_customers(email);
