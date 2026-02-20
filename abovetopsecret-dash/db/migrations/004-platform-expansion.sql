-- 004-platform-expansion.sql
-- New tables for OpticData Command Center future phases
-- Fixed: PostgreSQL syntax (SERIAL, TIMESTAMP, BOOLEAN)

-- User preferences (pinned metrics, layout customization)
CREATE TABLE IF NOT EXISTS user_preferences (
  id SERIAL PRIMARY KEY,
  preference_key VARCHAR(100) NOT NULL,
  preference_value TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Operator AI conversations
CREATE TABLE IF NOT EXISTS operator_conversations (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Operator AI memories (messages)
CREATE TABLE IF NOT EXISTS operator_memories (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES operator_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Automation rules engine
CREATE TABLE IF NOT EXISTS automation_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(50) NOT NULL,
  trigger_config JSONB NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_config JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(100) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Rule execution audit log
CREATE TABLE IF NOT EXISTS rule_execution_log (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES automation_rules(id) ON DELETE CASCADE,
  triggered_at TIMESTAMP DEFAULT NOW(),
  trigger_data JSONB,
  action_result JSONB,
  status VARCHAR(20) NOT NULL CHECK(status IN ('success', 'failure', 'skipped')),
  error_message TEXT
);

-- Custom campaign categories / grouping
CREATE TABLE IF NOT EXISTS custom_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  match_rules JSONB,
  color VARCHAR(7),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Cost settings (COGS, shipping, handling, etc.)
CREATE TABLE IF NOT EXISTS cost_settings (
  id SERIAL PRIMARY KEY,
  offer_name VARCHAR(200) NOT NULL DEFAULT 'ALL',
  cost_type VARCHAR(50) NOT NULL,
  cost_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_unit VARCHAR(20) NOT NULL DEFAULT 'fixed',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(offer_name, cost_type)
);

-- Saved SQL queries
CREATE TABLE IF NOT EXISTS saved_queries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  sql_text TEXT NOT NULL,
  created_by VARCHAR(100) NOT NULL DEFAULT 'admin',
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  channel VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User favorites / pinned views
CREATE TABLE IF NOT EXISTS user_favorites (
  id SERIAL PRIMARY KEY,
  item_type VARCHAR(50) NOT NULL,
  item_id VARCHAR(200) NOT NULL,
  label VARCHAR(200),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
