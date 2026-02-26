-- 050_extended_lookback.sql
-- Extended lookback windows for pixel attribution engine

BEGIN;

-- Add lookback_window column to attribution tables for window-awareness
ALTER TABLE pixel_attribution_results ADD COLUMN IF NOT EXISTS lookback_days INTEGER;
ALTER TABLE pixel_attribution_summary ADD COLUMN IF NOT EXISTS lookback_days INTEGER;

-- User-level lookback window preferences
CREATE TABLE IF NOT EXISTS attribution_settings (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  default_lookback_days INTEGER NOT NULL DEFAULT 30,  -- 7, 14, 30, 60, 90, 180, 365, or 0 for infinite
  default_model         VARCHAR(20) NOT NULL DEFAULT 'time_decay',
  accounting_mode       VARCHAR(20) NOT NULL DEFAULT 'accrual',  -- accrual (conversion date) or cash (click date)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
