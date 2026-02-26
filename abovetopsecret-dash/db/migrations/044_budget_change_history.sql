-- 044_budget_change_history.sql
-- Unified activity log for live ad set / campaign changes.
-- Tracks budget adjustments AND pause/resume status changes so users can
-- review their history, spot winning decisions, and catch accidental changes.

BEGIN;

CREATE TABLE IF NOT EXISTS campaign_activity_log (
  id           SERIAL       PRIMARY KEY,
  user_id      INTEGER      NOT NULL REFERENCES users(id),
  platform     TEXT         NOT NULL,
  entity_id    TEXT         NOT NULL,
  entity_type  TEXT         NOT NULL DEFAULT 'adset',
  action       TEXT         NOT NULL,            -- 'budget_change', 'pause', 'resume'
  old_budget   NUMERIC(12,2),
  new_budget   NUMERIC(12,2),
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_activity_log_entity ON campaign_activity_log (entity_id, created_at DESC);
CREATE INDEX idx_activity_log_user   ON campaign_activity_log (user_id, created_at DESC);

COMMIT;
