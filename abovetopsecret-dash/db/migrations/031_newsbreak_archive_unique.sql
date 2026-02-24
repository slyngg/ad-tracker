-- 031_newsbreak_archive_unique.sql — Prevent duplicate rows on backfill re-runs

CREATE UNIQUE INDEX IF NOT EXISTS uq_newsbreak_archive_date_user_ad
  ON newsbreak_ads_archive (archived_date, COALESCE(user_id, -1), (ad_data->>'ad_id'));
