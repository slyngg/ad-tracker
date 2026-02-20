-- 005-multi-user-auth.sql
-- Users table + multi-tenancy columns for per-user data isolation

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP
);

-- Add user_id to all existing tables that need per-user scoping
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE manual_overrides ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE fb_ads_today ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE cc_orders_today ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE cc_upsells_today ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE orders_archive ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE fb_ads_archive ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

-- Add user_id to Sprint 1 expansion tables
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE operator_conversations ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE operator_memories ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE rule_execution_log ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE custom_categories ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE cost_settings ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE saved_queries ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE user_favorites ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

-- Notifications table for in-app alerts
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  key_hash VARCHAR(255) NOT NULL,
  key_prefix VARCHAR(10) NOT NULL,
  name VARCHAR(100),
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP
);

-- Create indexes for user_id lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_user ON app_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_overrides_user ON manual_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_fb_ads_user ON fb_ads_today(user_id);
CREATE INDEX IF NOT EXISTS idx_cc_orders_user ON cc_orders_today(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_operator_convos_user ON operator_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_user ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_settings_user ON cost_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_user ON saved_queries(user_id);

-- Add unique constraint for notification preferences per user
DO $$ BEGIN
  ALTER TABLE notification_preferences ADD CONSTRAINT uq_notif_prefs_user_channel_event
    UNIQUE (user_id, channel, event_type);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
