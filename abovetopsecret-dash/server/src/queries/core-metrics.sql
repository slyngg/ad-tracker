SELECT
  fb.account_name,
  COALESCE(cc.offer_name, 'Unattributed') AS offer_name,
  SUM(fb.spend) AS spend,
  SUM(cc.revenue) AS revenue,
  CASE WHEN SUM(fb.spend) > 0 THEN SUM(cc.revenue) / SUM(fb.spend) ELSE 0 END AS roi,
  CASE WHEN COUNT(DISTINCT cc.order_id) > 0 THEN SUM(fb.spend) / COUNT(DISTINCT cc.order_id) ELSE 0 END AS cpa,
  CASE WHEN COUNT(DISTINCT cc.order_id) > 0 THEN SUM(cc.revenue) / COUNT(DISTINCT cc.order_id) ELSE 0 END AS aov,
  CASE WHEN SUM(fb.impressions) > 0 THEN SUM(fb.clicks)::FLOAT / SUM(fb.impressions) ELSE 0 END AS ctr,
  CASE WHEN SUM(fb.impressions) > 0 THEN (SUM(fb.spend) / SUM(fb.impressions)) * 1000 ELSE 0 END AS cpm,
  CASE WHEN SUM(fb.clicks) > 0 THEN SUM(fb.spend) / SUM(fb.clicks) ELSE 0 END AS cpc,
  CASE WHEN SUM(fb.clicks) > 0 THEN COUNT(DISTINCT cc.order_id)::FLOAT / SUM(fb.clicks) ELSE 0 END AS cvr,
  COUNT(DISTINCT cc.order_id) AS conversions,
  CASE WHEN COUNT(DISTINCT cc.order_id) > 0
    THEN SUM(CASE WHEN cc.new_customer THEN 1 ELSE 0 END)::FLOAT / COUNT(DISTINCT cc.order_id)
    ELSE 0 END AS new_customer_pct
FROM fb_ads_today fb
LEFT JOIN cc_orders_today cc ON fb.ad_set_name = cc.utm_campaign
GROUP BY fb.account_name, cc.offer_name
ORDER BY spend DESC;
