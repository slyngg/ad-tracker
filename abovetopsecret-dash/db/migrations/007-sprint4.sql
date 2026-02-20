-- Sprint 4: Operator Tools, Voice, Rules Engine & Polish

-- Long-term operator memory table (distinct from operator_memories which stores chat messages)
CREATE TABLE IF NOT EXISTS operator_long_term_memory (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  fact TEXT NOT NULL,
  source_message_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operator_ltm_user ON operator_long_term_memory(user_id);

-- Rule cooldowns + enhanced fields
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 0;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS last_fired_at TIMESTAMP;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS action_meta JSONB DEFAULT '{}';

-- Rule execution log enhancements
ALTER TABLE rule_execution_log ADD COLUMN IF NOT EXISTS action_detail JSONB DEFAULT '{}';

-- Notification channel support
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN DEFAULT false;
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS slack_enabled BOOLEAN DEFAULT false;

-- Pixel events table for tracking pixel fires
CREATE TABLE IF NOT EXISTS pixel_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  funnel_page VARCHAR(50),
  event_type VARCHAR(30),
  fbclid VARCHAR(255),
  utm_source VARCHAR(255),
  utm_campaign VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pixel_events_user ON pixel_events(user_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_created ON pixel_events(created_at);
