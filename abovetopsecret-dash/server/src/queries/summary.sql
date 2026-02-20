SELECT
  COALESCE(SUM(fb.spend), 0) AS total_spend,
  COALESCE(SUM(cc.revenue), 0) AS total_revenue,
  CASE WHEN SUM(fb.spend) > 0 THEN SUM(cc.revenue) / SUM(fb.spend) ELSE 0 END AS total_roi,
  COUNT(DISTINCT cc.order_id) AS total_conversions
FROM fb_ads_today fb
LEFT JOIN cc_orders_today cc ON fb.ad_set_name = cc.utm_campaign;
