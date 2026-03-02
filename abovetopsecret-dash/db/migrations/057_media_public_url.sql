-- Add public_url column to campaign_media_uploads
ALTER TABLE campaign_media_uploads ADD COLUMN IF NOT EXISTS public_url TEXT;
