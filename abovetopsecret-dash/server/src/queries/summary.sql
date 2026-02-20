-- Summary totals — computed from each table independently, no join needed.
SELECT
  (SELECT COALESCE(SUM(spend), 0) FROM fb_ads_today) AS total_spend,
  (SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) FROM cc_orders_today WHERE order_status = 'completed') AS total_revenue,
  (SELECT COUNT(DISTINCT order_id) FROM cc_orders_today WHERE order_status = 'completed') AS total_conversions;
-- ROI = total_revenue / total_spend (computed in application layer)
