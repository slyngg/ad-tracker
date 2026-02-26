-- 048_new_vs_returning.sql
-- New vs Returning customer classification for attribution

BEGIN;

-- Add is_new_customer to pixel_events_v2 (set on Purchase events)
ALTER TABLE pixel_events_v2
  ADD COLUMN IF NOT EXISTS is_new_customer BOOLEAN;

-- Add is_new_customer to pixel_attribution_results
ALTER TABLE pixel_attribution_results
  ADD COLUMN IF NOT EXISTS is_new_customer BOOLEAN;

-- Add is_new_customer to pixel_attribution_summary
ALTER TABLE pixel_attribution_summary
  ADD COLUMN IF NOT EXISTS is_new_customer BOOLEAN;

-- Add first_order_date to pixel_visitors
ALTER TABLE pixel_visitors
  ADD COLUMN IF NOT EXISTS first_order_date TIMESTAMPTZ;

-- Composite index for new vs returning queries on events
CREATE INDEX IF NOT EXISTS idx_pev2_new_customer
  ON pixel_events_v2(user_id, is_new_customer, event_name, created_at);

-- Index on attribution results for new vs returning filtering
CREATE INDEX IF NOT EXISTS idx_par_new_customer
  ON pixel_attribution_results(user_id, model, is_new_customer);

-- Index on attribution summary for new vs returning filtering
CREATE INDEX IF NOT EXISTS idx_pas_new_customer
  ON pixel_attribution_summary(user_id, model, is_new_customer, date);

COMMIT;
