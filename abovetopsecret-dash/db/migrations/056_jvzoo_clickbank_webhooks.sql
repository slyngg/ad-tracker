BEGIN;

-- Add tracking_data JSONB column for ClickBank v8.0 rich tracking data (affSub1-5, device info, traffic source, etc.)
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS tracking_data JSONB;

-- Index on source for filtering orders by integration (checkout_champ, shopify, jvzoo, clickbank)
CREATE INDEX IF NOT EXISTS idx_cc_orders_source ON cc_orders_today(source);

COMMIT;
