import pool from '../db';

const SENSITIVE_KEYS = [
  'fb_access_token',
  'cc_api_key',
  'cc_webhook_secret',
  'shopify_webhook_secret',
  'auth_token',
];

// Environment variable fallback mapping
const ENV_FALLBACKS: Record<string, string> = {
  fb_access_token: 'FB_ACCESS_TOKEN',
  fb_ad_account_ids: 'FB_AD_ACCOUNT_IDS',
  cc_webhook_secret: 'CC_WEBHOOK_SECRET',
  shopify_webhook_secret: 'SHOPIFY_WEBHOOK_SECRET',
  auth_token: 'AUTH_TOKEN',
};

export async function getSetting(key: string, userId?: number | null): Promise<string | undefined> {
  try {
    let result;
    if (userId) {
      result = await pool.query(
        'SELECT value FROM app_settings WHERE key = $1 AND user_id = $2',
        [key, userId]
      );
    }
    // Fall back to global setting if no user-specific setting found
    if (!result || result.rows.length === 0) {
      result = await pool.query(
        'SELECT value FROM app_settings WHERE key = $1 AND user_id IS NULL',
        [key]
      );
    }
    if (result.rows.length > 0) {
      return result.rows[0].value;
    }
  } catch {
    // Table may not exist yet during startup
  }

  // Fall back to environment variable
  const envKey = ENV_FALLBACKS[key];
  if (envKey) {
    return process.env[envKey] || undefined;
  }

  return undefined;
}

export async function setSetting(key: string, value: string, updatedBy = 'admin', userId?: number | null): Promise<void> {
  // Use DELETE+INSERT to work with the composite unique index on (key, COALESCE(user_id, -1))
  await pool.query(
    'DELETE FROM app_settings WHERE key = $1 AND COALESCE(user_id, -1) = COALESCE($2::int, -1)',
    [key, userId || null]
  );
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at, user_id)
     VALUES ($1, $2, $3, NOW(), $4)`,
    [key, value, updatedBy, userId || null]
  );
}

export async function deleteSetting(key: string, userId?: number | null): Promise<void> {
  if (userId) {
    await pool.query('DELETE FROM app_settings WHERE key = $1 AND user_id = $2', [key, userId]);
  } else {
    await pool.query('DELETE FROM app_settings WHERE key = $1 AND user_id IS NULL', [key]);
  }
}

function maskValue(key: string, value: string): string {
  if (SENSITIVE_KEYS.includes(key) && value.length > 4) {
    return '****' + value.slice(-4);
  }
  return value;
}

export async function getAllSettings(userId?: number | null): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  try {
    // Get global settings first
    const globalResult = await pool.query('SELECT key, value FROM app_settings WHERE user_id IS NULL ORDER BY key');
    for (const row of globalResult.rows) {
      result[row.key] = maskValue(row.key, row.value);
    }

    // Overlay user-specific settings
    if (userId) {
      const userResult = await pool.query('SELECT key, value FROM app_settings WHERE user_id = $1 ORDER BY key', [userId]);
      for (const row of userResult.rows) {
        result[row.key] = maskValue(row.key, row.value);
      }
    }
  } catch {
    // Table may not exist yet
  }

  // Include env var fallbacks that aren't already in DB (masked)
  for (const [settingKey, envKey] of Object.entries(ENV_FALLBACKS)) {
    if (!(settingKey in result) && process.env[envKey]) {
      result[settingKey] = maskValue(settingKey, process.env[envKey]!);
      result[`${settingKey}_source`] = 'env';
    }
  }

  return result;
}
