BEGIN;

-- Benchmark configs — user-defined KPI targets
CREATE TABLE IF NOT EXISTS profit_benchmarks (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric          VARCHAR(30) NOT NULL,  -- roas, cpa, ncpa, mer, aov, profit_margin
  threshold_green NUMERIC(12,4),         -- >= this = Scale (green)
  threshold_amber NUMERIC(12,4),         -- >= this = Watch (amber), below = Cut (red)
  auto_computed   BOOLEAN NOT NULL DEFAULT true,  -- auto-derived from profitable days
  last_computed   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, metric)
);

-- Daily profit snapshots — tracks daily performance for benchmark computation
CREATE TABLE IF NOT EXISTS daily_profit_snapshots (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  total_spend     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_revenue   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_orders    INTEGER NOT NULL DEFAULT 0,
  new_orders      INTEGER NOT NULL DEFAULT 0,
  returning_orders INTEGER NOT NULL DEFAULT 0,
  cogs            NUMERIC(12,2) NOT NULL DEFAULT 0,  -- cost of goods sold (from settings)
  profit          NUMERIC(12,2) NOT NULL DEFAULT 0,
  roas            NUMERIC(10,4),
  cpa             NUMERIC(10,4),
  ncpa            NUMERIC(10,4),
  mer             NUMERIC(10,4),  -- Marketing Efficiency Ratio (total rev / total spend)
  aov             NUMERIC(10,4),
  profit_margin   NUMERIC(10,4),
  is_profitable   BOOLEAN NOT NULL DEFAULT false,
  is_promo_day    BOOLEAN NOT NULL DEFAULT false,  -- excluded from benchmark calc
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_dps_user_date ON daily_profit_snapshots(user_id, date);
CREATE INDEX IF NOT EXISTS idx_dps_profitable ON daily_profit_snapshots(user_id, is_profitable, date);

-- Campaign stoplights — cached signal per campaign
CREATE TABLE IF NOT EXISTS campaign_stoplights (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform        VARCHAR(30) NOT NULL,
  campaign_id     VARCHAR(255) NOT NULL,
  campaign_name   TEXT,
  signal          VARCHAR(10) NOT NULL DEFAULT 'watch',  -- scale, watch, cut
  roas            NUMERIC(10,4),
  cpa             NUMERIC(10,4),
  ncpa            NUMERIC(10,4),
  spend           NUMERIC(12,2),
  revenue         NUMERIC(12,2),
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_cs_user_signal ON campaign_stoplights(user_id, signal);

COMMIT;
