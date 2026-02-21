-- Core metrics query with pre-aggregated CTEs to prevent many-to-many fan-out.
-- fb_agg: collapses multiple ads per ad_set into one row.
-- cc_agg: collapses multiple orders per utm_campaign into one row.
-- In production, user_id filtering is applied via parameterized queries in metrics.ts.
-- Parameter $1 = user_id. Filter clause: AND user_id = $1 (or AND user_id IS NULL for legacy).

WITH fb_agg AS (
  SELECT
    ad_set_name,
    account_name,
    SUM(spend) AS spend,
    SUM(clicks) AS clicks,
    SUM(impressions) AS impressions,
    SUM(landing_page_views) AS landing_page_views
  FROM fb_ads_today
  GROUP BY ad_set_name, account_name
),
cc_agg AS (
  SELECT
    utm_campaign,
    offer_name,
    SUM(COALESCE(subtotal, revenue)) AS revenue,
    COUNT(DISTINCT order_id) AS conversions,
    COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS new_customers
  FROM cc_orders_today
  WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL)
  GROUP BY utm_campaign, offer_name
)
SELECT
  fb.account_name,
  COALESCE(cc.offer_name, 'Unattributed') AS offer_name,
  SUM(fb.spend) AS spend,
  COALESCE(SUM(cc.revenue), 0) AS revenue,
  CASE WHEN SUM(fb.spend) > 0 THEN COALESCE(SUM(cc.revenue), 0) / SUM(fb.spend) ELSE 0 END AS roi,
  CASE WHEN COALESCE(SUM(cc.conversions), 0) > 0 THEN SUM(fb.spend) / SUM(cc.conversions) ELSE 0 END AS cpa,
  CASE WHEN COALESCE(SUM(cc.conversions), 0) > 0 THEN SUM(cc.revenue) / SUM(cc.conversions) ELSE 0 END AS aov,
  CASE WHEN SUM(fb.impressions) > 0 THEN SUM(fb.clicks)::FLOAT / SUM(fb.impressions) ELSE 0 END AS ctr,
  CASE WHEN SUM(fb.impressions) > 0 THEN (SUM(fb.spend) / SUM(fb.impressions)) * 1000 ELSE 0 END AS cpm,
  CASE WHEN SUM(fb.clicks) > 0 THEN SUM(fb.spend) / SUM(fb.clicks) ELSE 0 END AS cpc,
  CASE WHEN SUM(fb.clicks) > 0 THEN COALESCE(SUM(cc.conversions), 0)::FLOAT / SUM(fb.clicks) ELSE 0 END AS cvr,
  COALESCE(SUM(cc.conversions), 0) AS conversions,
  CASE WHEN COALESCE(SUM(cc.conversions), 0) > 0
    THEN SUM(cc.new_customers)::FLOAT / SUM(cc.conversions)
    ELSE 0 END AS new_customer_pct,
  CASE WHEN SUM(fb.impressions) > 0 THEN SUM(fb.landing_page_views)::FLOAT / SUM(fb.impressions) ELSE 0 END AS lp_ctr
FROM fb_agg fb
LEFT JOIN cc_agg cc ON normalize_attribution_key(fb.ad_set_name) = normalize_attribution_key(cc.utm_campaign)
GROUP BY fb.account_name, cc.offer_name
ORDER BY spend DESC;
