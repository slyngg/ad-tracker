-- 026: AI Creative Templates + Generation Jobs
-- New tables for reusable creative templates and AI generation tracking

-- ── creative_templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS creative_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  structure JSONB DEFAULT '{}'::JSONB,
  variable_slots JSONB DEFAULT '[]'::JSONB,
  source_creative_id INTEGER,
  platform TEXT NOT NULL DEFAULT 'meta',
  creative_type TEXT NOT NULL DEFAULT 'ad_copy',
  tags TEXT[] DEFAULT '{}',
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_creative_templates_user ON creative_templates(user_id);
CREATE INDEX idx_creative_templates_shared ON creative_templates(is_shared) WHERE is_shared = TRUE;

-- ── generation_jobs ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generation_jobs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'ad_copy',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  input_params JSONB DEFAULT '{}'::JSONB,
  output JSONB,
  model_used TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_generation_jobs_user ON generation_jobs(user_id);
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status);

-- ── Alter generated_creatives ──────────────────────────────
ALTER TABLE generated_creatives
  ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES creative_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand_config_id INTEGER REFERENCES brand_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS model_used TEXT,
  ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generation_job_id INTEGER REFERENCES generation_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_campaign_id INTEGER REFERENCES campaign_drafts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT '[]'::JSONB;
