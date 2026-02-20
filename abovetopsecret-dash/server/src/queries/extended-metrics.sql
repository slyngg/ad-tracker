-- Pack Take Rates (1v3v5) for core SKUs
-- query:take_rates
SELECT
  offer_name,
  ROUND(SUM(CASE WHEN quantity = 1 THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 1) AS take_rate_1,
  ROUND(SUM(CASE WHEN quantity = 3 THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 1) AS take_rate_3,
  ROUND(SUM(CASE WHEN quantity = 5 THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 1) AS take_rate_5
FROM cc_orders_today
WHERE is_core_sku = true
GROUP BY offer_name;

-- Subscription Opt-in %
-- query:subscription_pct
SELECT
  offer_name,
  ROUND(SUM(CASE WHEN subscription_id IS NOT NULL THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 1) AS subscription_pct
FROM cc_orders_today
GROUP BY offer_name;

-- Subscription Pack Take Rates
-- query:sub_take_rates
SELECT
  offer_name,
  ROUND(SUM(CASE WHEN quantity = 1 THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 1) AS sub_take_rate_1,
  ROUND(SUM(CASE WHEN quantity = 3 THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 1) AS sub_take_rate_3,
  ROUND(SUM(CASE WHEN quantity = 5 THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) * 100, 1) AS sub_take_rate_5
FROM cc_orders_today
WHERE subscription_id IS NOT NULL
GROUP BY offer_name;

-- Upsell Take / Decline Rates
-- query:upsell_rates
SELECT
  offer_name,
  ROUND(SUM(CASE WHEN accepted THEN 1 ELSE 0 END)::FLOAT / NULLIF(SUM(CASE WHEN offered THEN 1 ELSE 0 END), 0) * 100, 1) AS upsell_take_rate,
  ROUND((1 - (SUM(CASE WHEN accepted THEN 1 ELSE 0 END)::FLOAT / NULLIF(SUM(CASE WHEN offered THEN 1 ELSE 0 END), 0))) * 100, 1) AS upsell_decline_rate
FROM cc_upsells_today
GROUP BY offer_name;
