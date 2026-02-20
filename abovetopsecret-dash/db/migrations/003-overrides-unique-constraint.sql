-- Migration 003: Add UNIQUE constraint on manual_overrides(metric_key, offer_name)
-- Run on existing deployments: psql $DATABASE_URL -f db/migrations/003-overrides-unique-constraint.sql

-- Remove duplicates first: keep only the most recent override for each (metric_key, offer_name)
DELETE FROM manual_overrides a
USING manual_overrides b
WHERE a.id < b.id
  AND a.metric_key = b.metric_key
  AND a.offer_name = b.offer_name;

-- Add NOT NULL constraints
ALTER TABLE manual_overrides ALTER COLUMN metric_key SET NOT NULL;
ALTER TABLE manual_overrides ALTER COLUMN offer_name SET NOT NULL;
ALTER TABLE manual_overrides ALTER COLUMN override_value SET NOT NULL;

-- Add the unique constraint
ALTER TABLE manual_overrides ADD CONSTRAINT manual_overrides_metric_offer_unique
  UNIQUE (metric_key, offer_name);
