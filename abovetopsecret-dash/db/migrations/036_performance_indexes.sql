-- Performance indexes for heavy dashboard queries
-- Targets the exact WHERE/GROUP BY patterns used by metrics, accounts/summary, and analytics endpoints

-- newsbreak_ads_today: used in accounts/summary LATERAL join (user_id + account_id)
CREATE INDEX IF NOT EXISTS idx_newsbreak_ads_today_user_account
  ON newsbreak_ads_today(user_id, account_id);

-- cc_orders_today: the most-queried table — every metrics/summary/analytics endpoint filters by these columns
CREATE INDEX IF NOT EXISTS idx_cc_orders_today_user_status_test
  ON cc_orders_today(user_id, order_status, is_test);

-- cc_upsells_today: upsell rate query in metrics.ts filters by user_id
CREATE INDEX IF NOT EXISTS idx_cc_upsells_today_user
  ON cc_upsells_today(user_id);

-- newsbreak_ads_archive: missing (archived_date, user_id) composite — other archives have it
CREATE INDEX IF NOT EXISTS idx_newsbreak_ads_archive_date_user
  ON newsbreak_ads_archive(archived_date, user_id);

-- orders_archive: JSONB extraction on order_status is expensive; add expression index
-- for the common pattern: WHERE archived_date = X AND order_data->>'order_status' = 'completed'
CREATE INDEX IF NOT EXISTS idx_orders_archive_date_status
  ON orders_archive(archived_date, user_id, ((order_data->>'order_status')));
