-- 051_no_double_counting.sql
-- No-double-counting guarantee: verification columns + audit log

BEGIN;

-- Add constraint columns for verification
ALTER TABLE pixel_attribution_results ADD COLUMN IF NOT EXISTS credit_verified BOOLEAN NOT NULL DEFAULT false;

-- Verification log — audit trail for credit normalization
CREATE TABLE IF NOT EXISTS attribution_verification_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id        VARCHAR(255) NOT NULL,
  model           VARCHAR(20) NOT NULL,
  actual_revenue  NUMERIC(12,2) NOT NULL,
  total_credited  NUMERIC(12,2) NOT NULL,
  credit_sum      NUMERIC(10,6) NOT NULL,
  was_normalized  BOOLEAN NOT NULL DEFAULT false,
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_avl_user ON attribution_verification_log(user_id, verified_at);

COMMIT;
