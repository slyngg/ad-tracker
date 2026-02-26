-- 044_budget_change_history.sql
-- Tracks all budget changes made to live ad sets / campaigns.
-- Allows users to review their budget adjustment history, spot winning
-- decisions, and catch accidental changes.

BEGIN;

CREATE TABLE IF NOT EXISTS budget_change_history (
  id           SERIAL       PRIMARY KEY,
  user_id      INTEGER      NOT NULL REFERENCES users(id),
  platform     TEXT         NOT NULL,
  entity_id    TEXT         NOT NULL,
  old_budget   NUMERIC(12,2),
  new_budget   NUMERIC(12,2) NOT NULL,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_budget_history_entity ON budget_change_history (entity_id, created_at DESC);
CREATE INDEX idx_budget_history_user   ON budget_change_history (user_id, created_at DESC);

COMMIT;
