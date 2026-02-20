-- Exceed features: Workspaces, AI Agents, Reports, Creative Gen
-- Migration 014

CREATE TABLE IF NOT EXISTS workspaces (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'layout-dashboard',
  color TEXT DEFAULT '#3b82f6',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_widgets (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  title TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 1,
  height INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_agents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  tools TEXT[] DEFAULT '{}',
  model TEXT DEFAULT 'claude-sonnet-4-6',
  temperature NUMERIC(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  is_active BOOLEAN DEFAULT true,
  icon TEXT DEFAULT 'bot',
  color TEXT DEFAULT '#8b5cf6',
  workspace_id INTEGER REFERENCES workspaces(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_conversations (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES ai_agents(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  title TEXT DEFAULT 'New conversation',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES agent_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  report_type TEXT NOT NULL,
  content TEXT NOT NULL,
  data_snapshot JSONB DEFAULT '{}',
  generated_by TEXT DEFAULT 'operator',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generated_creatives (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  creative_type TEXT NOT NULL,
  platform TEXT,
  content JSONB NOT NULL,
  inspiration_ad_id TEXT,
  brand_vault_used BOOLEAN DEFAULT false,
  generated_by TEXT DEFAULT 'operator',
  rating INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_user ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_widgets_workspace ON workspace_widgets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_user ON ai_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_conv ON agent_conversations(agent_id, user_id);
CREATE INDEX IF NOT EXISTS idx_reports_user ON generated_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_creatives_user ON generated_creatives(user_id);
