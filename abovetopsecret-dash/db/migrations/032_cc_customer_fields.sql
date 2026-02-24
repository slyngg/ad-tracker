-- Add customer_name column for RFM display
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

-- Index for RFM / repeat-purchase grouping on customer_email
CREATE INDEX IF NOT EXISTS idx_cc_orders_customer_email
  ON cc_orders_today(customer_email) WHERE customer_email IS NOT NULL;
