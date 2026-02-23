-- Backfill account_id on existing cc_orders_today rows
-- Maps LOWER(utm_source) → platform → MIN(accounts.id) per user

-- Facebook / Meta
UPDATE cc_orders_today o
SET account_id = a.acct_id
FROM (
  SELECT user_id, MIN(id) AS acct_id
  FROM accounts
  WHERE platform = 'meta' AND status = 'active'
  GROUP BY user_id
) a
WHERE o.user_id = a.user_id
  AND o.account_id IS NULL
  AND LOWER(o.utm_source) IN ('facebook', 'fb', 'meta', 'instagram', 'ig');

-- TikTok
UPDATE cc_orders_today o
SET account_id = a.acct_id
FROM (
  SELECT user_id, MIN(id) AS acct_id
  FROM accounts
  WHERE platform = 'tiktok' AND status = 'active'
  GROUP BY user_id
) a
WHERE o.user_id = a.user_id
  AND o.account_id IS NULL
  AND LOWER(o.utm_source) = 'tiktok';

-- NewsBreak
UPDATE cc_orders_today o
SET account_id = a.acct_id
FROM (
  SELECT user_id, MIN(id) AS acct_id
  FROM accounts
  WHERE platform = 'newsbreak' AND status = 'active'
  GROUP BY user_id
) a
WHERE o.user_id = a.user_id
  AND o.account_id IS NULL
  AND LOWER(o.utm_source) = 'newsbreak';

-- Google
UPDATE cc_orders_today o
SET account_id = a.acct_id
FROM (
  SELECT user_id, MIN(id) AS acct_id
  FROM accounts
  WHERE platform = 'google' AND status = 'active'
  GROUP BY user_id
) a
WHERE o.user_id = a.user_id
  AND o.account_id IS NULL
  AND LOWER(o.utm_source) IN ('google', 'bing');
