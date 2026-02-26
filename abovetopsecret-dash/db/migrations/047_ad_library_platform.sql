-- Add platform column to ad_library_cache for multi-platform ad spy support
ALTER TABLE ad_library_cache ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'meta';

-- Drop old unique constraint and create a new one that includes platform
ALTER TABLE ad_library_cache DROP CONSTRAINT IF EXISTS ad_library_cache_user_id_meta_ad_id_key;
ALTER TABLE ad_library_cache ADD CONSTRAINT ad_library_cache_user_platform_ad_key UNIQUE (user_id, platform, meta_ad_id);

-- Add platform to ad_library_searches too
ALTER TABLE ad_library_searches ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'meta';

-- Index for platform-filtered queries
CREATE INDEX IF NOT EXISTS idx_ad_library_cache_platform ON ad_library_cache (user_id, platform);
