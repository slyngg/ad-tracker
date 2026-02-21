-- Checkout Champ webhook event log
-- Captures every inbound webhook for audit trail, debugging, and replay

CREATE TABLE IF NOT EXISTS cc_webhook_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  account_id    INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  event_type    VARCHAR(50) NOT NULL,         -- new_sale, upsell, decline, refund, chargeback, subscription_started, recurring_order, rebill_decline, cancel, pause, reactivate, partial, lead, capture, pre_billing, recycle_failed, cod_pending, full_refund, partial_refund
  order_id      VARCHAR(50),
  customer_id   VARCHAR(50),
  purchase_id   VARCHAR(50),
  payload       JSONB NOT NULL,               -- full raw webhook body
  processed     BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cc_wh_events_user    ON cc_webhook_events (user_id);
CREATE INDEX idx_cc_wh_events_type    ON cc_webhook_events (event_type);
CREATE INDEX idx_cc_wh_events_order   ON cc_webhook_events (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_cc_wh_events_created ON cc_webhook_events (created_at);

-- Subscription lifecycle events from webhooks
-- Critical for growth ops: LTV, retention, churn, rebill rates
CREATE TABLE IF NOT EXISTS cc_subscription_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purchase_id   VARCHAR(50) NOT NULL,
  order_id      VARCHAR(50),
  customer_id   VARCHAR(50),
  event_type    VARCHAR(30) NOT NULL,         -- started, recurring, rebill_decline, cancel, pause, reactivate, recycle_failed, pre_billing
  amount        NUMERIC(12,2),
  billing_cycle INTEGER,
  next_bill_date DATE,
  cancel_reason TEXT,
  raw_data      JSONB,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cc_sub_events_user     ON cc_subscription_events (user_id);
CREATE INDEX idx_cc_sub_events_purchase ON cc_subscription_events (purchase_id);
CREATE INDEX idx_cc_sub_events_type     ON cc_subscription_events (event_type);
