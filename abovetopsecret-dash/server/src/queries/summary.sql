-- Summary totals — computed from each table independently, no join needed.
-- In production, user_id filtering is applied via parameterized queries in metrics.ts.
-- Parameter $1 = user_id (NULL for legacy/global scope).
-- Filter clause: AND (user_id = $1 OR ($1 IS NULL AND user_id IS NULL))
SELECT
  (SELECT COALESCE(SUM(spend), 0) FROM fb_ads_today WHERE (user_id = $1 OR ($1 IS NULL AND user_id IS NULL))) AS total_spend,
  (SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND (user_id = $1 OR ($1 IS NULL AND user_id IS NULL))) AS total_revenue,
  (SELECT COUNT(DISTINCT order_id) FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND (user_id = $1 OR ($1 IS NULL AND user_id IS NULL))) AS total_conversions;
-- ROI = total_revenue / total_spend (computed in application layer)
