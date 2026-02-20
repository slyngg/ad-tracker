-- Daily Reset Script
-- Archives today's data then truncates working tables
-- Intended to run at midnight via the scheduler

-- Archive FB ads data
INSERT INTO fb_ads_archive (archived_date, ad_data)
SELECT CURRENT_DATE, row_to_json(fb_ads_today)::jsonb
FROM fb_ads_today;

-- Archive orders data
INSERT INTO orders_archive (archived_date, order_data)
SELECT CURRENT_DATE, row_to_json(cc_orders_today)::jsonb
FROM cc_orders_today;

-- Truncate working tables
TRUNCATE fb_ads_today RESTART IDENTITY;
TRUNCATE cc_orders_today RESTART IDENTITY;
TRUNCATE cc_upsells_today RESTART IDENTITY;
