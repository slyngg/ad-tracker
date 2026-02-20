-- 004-platform-expansion.sql
-- New tables for OpticData Command Center future phases
-- All CREATE TABLE IF NOT EXISTS for idempotency

-- User preferences (pinned metrics, layout customization)
CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  preference_key TEXT NOT NULL,
  preference_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, preference_key)
);

-- Operator AI conversations
CREATE TABLE IF NOT EXISTS operator_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  title TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Operator AI memories
CREATE TABLE IF NOT EXISTS operator_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES operator_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata TEXT, -- JSON blob
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Automation rules engine
CREATE TABLE IF NOT EXISTS automation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL, -- 'metric_threshold', 'schedule', 'event'
  trigger_config TEXT NOT NULL, -- JSON config
  action_type TEXT NOT NULL, -- 'alert', 'pause_campaign', 'adjust_budget', 'webhook'
  action_config TEXT NOT NULL, -- JSON config
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Rule execution audit log
CREATE TABLE IF NOT EXISTS rule_execution_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER REFERENCES automation_rules(id) ON DELETE CASCADE,
  triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  trigger_data TEXT, -- JSON snapshot of what triggered the rule
  action_result TEXT, -- JSON result of the action
  status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'skipped')),
  error_message TEXT
);

-- Custom campaign categories / grouping
CREATE TABLE IF NOT EXISTS custom_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  match_rules TEXT, -- JSON: array of {field, operator, value} for auto-categorization
  color TEXT, -- hex color for UI
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cost settings (COGS, shipping, handling, etc.)
CREATE TABLE IF NOT EXISTS cost_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_name TEXT NOT NULL DEFAULT 'ALL',
  cost_type TEXT NOT NULL, -- 'cogs', 'shipping', 'handling', 'payment_processing', 'other'
  cost_value REAL NOT NULL DEFAULT 0,
  cost_unit TEXT NOT NULL DEFAULT 'fixed', -- 'fixed', 'percentage'
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(offer_name, cost_type)
);

-- Saved SQL queries
CREATE TABLE IF NOT EXISTS saved_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  sql_text TEXT NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'admin',
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  channel TEXT NOT NULL, -- 'email', 'slack', 'push', 'in_app'
  event_type TEXT NOT NULL, -- 'rule_triggered', 'sync_failed', 'budget_alert', etc.
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT, -- JSON: channel-specific config (email address, slack webhook, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, channel, event_type)
);

-- User favorites / pinned views
CREATE TABLE IF NOT EXISTS user_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL DEFAULT 'default',
  item_type TEXT NOT NULL, -- 'page', 'query', 'report', 'filter_preset'
  item_id TEXT NOT NULL, -- route path, query id, etc.
  label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_type, item_id)
);
