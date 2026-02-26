-- 043_nb_campaign_account_map.sql
-- Maps NewsBreak campaigns to specific ad accounts.
-- The NB reports API doesn't support per-advertiser filtering, so we pull
-- all campaigns in bulk and need this table to resolve which account each
-- campaign belongs to.

BEGIN;

CREATE TABLE IF NOT EXISTS nb_campaign_account_map (
  user_id      INTEGER      NOT NULL REFERENCES users(id),
  campaign_id  TEXT         NOT NULL,
  account_id   INTEGER      NOT NULL REFERENCES accounts(id),
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (user_id, campaign_id)
);

COMMIT;
