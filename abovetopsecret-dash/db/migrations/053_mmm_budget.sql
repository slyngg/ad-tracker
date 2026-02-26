BEGIN;

-- MMM model parameters — fitted response curves per channel
CREATE TABLE IF NOT EXISTS mmm_channel_params (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel         VARCHAR(30) NOT NULL,  -- meta, tiktok, google, newsbreak
  -- Hill/log response curve: revenue = alpha * (spend^beta) / (spend^beta + gamma^beta)
  alpha           NUMERIC(12,4) NOT NULL DEFAULT 0,
  beta            NUMERIC(8,4) NOT NULL DEFAULT 1,
  gamma           NUMERIC(12,4) NOT NULL DEFAULT 1000,
  r_squared       NUMERIC(6,4),
  data_points     INTEGER NOT NULL DEFAULT 0,
  last_fitted     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, channel)
);

-- Budget scenarios — saved what-if analyses
CREATE TABLE IF NOT EXISTS budget_scenarios (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  total_budget    NUMERIC(12,2) NOT NULL,
  allocations     JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ channel, spend, predicted_revenue }]
  predicted_total_revenue NUMERIC(12,2),
  predicted_roas  NUMERIC(10,4),
  is_optimal      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_budget_scenarios_user ON budget_scenarios(user_id);

COMMIT;
