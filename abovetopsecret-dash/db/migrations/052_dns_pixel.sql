BEGIN;

-- Add DNS configuration to pixel_sites
ALTER TABLE pixel_sites ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255);  -- e.g. "i.mystore.com"
ALTER TABLE pixel_sites ADD COLUMN IF NOT EXISTS dns_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pixel_sites ADD COLUMN IF NOT EXISTS dns_verified_at TIMESTAMPTZ;
ALTER TABLE pixel_sites ADD COLUMN IF NOT EXISTS dns_challenge_token VARCHAR(64);  -- TXT record verification

CREATE INDEX IF NOT EXISTS idx_pixel_sites_custom_domain ON pixel_sites(custom_domain) WHERE custom_domain IS NOT NULL;

COMMIT;
