import pool from '../db';
import { getProvider, decrypt, encrypt } from './oauth-providers';

/**
 * Refresh OAuth tokens that are expired or expire within the next 7 days.
 * Called by the scheduler every hour.
 */
export async function refreshOAuthTokens(): Promise<{ refreshed: number; failed: number }> {
  const result = await pool.query(`
    SELECT id, user_id, platform, refresh_token_encrypted, credentials, token_expires_at
    FROM integration_configs
    WHERE connection_method = 'oauth'
      AND status IN ('connected')
      AND token_expires_at IS NOT NULL
      AND token_expires_at < NOW() + INTERVAL '7 days'
  `);

  let refreshed = 0;
  let failed = 0;

  for (const row of result.rows) {
    try {
      const provider = getProvider(row.platform);
      if (!provider?.refreshToken) continue;

      let refreshTokenValue: string;
      if (row.refresh_token_encrypted) {
        refreshTokenValue = decrypt(row.refresh_token_encrypted);
      } else if (row.platform === 'meta') {
        // Meta re-exchanges the current access token
        const creds = row.credentials || {};
        if (!creds.access_token_encrypted) continue;
        refreshTokenValue = decrypt(creds.access_token_encrypted);
      } else {
        continue;
      }

      const tokens = await provider.refreshToken(refreshTokenValue);
      const encryptedAccess = encrypt(tokens.access_token);
      const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : row.refresh_token_encrypted;
      const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

      await pool.query(`
        UPDATE integration_configs SET
          credentials = jsonb_set(credentials, '{access_token_encrypted}', $1::jsonb),
          refresh_token_encrypted = $2,
          token_expires_at = $3,
          token_refreshed_at = NOW(),
          error_message = NULL,
          updated_at = NOW()
        WHERE id = $4
      `, [JSON.stringify(encryptedAccess), encryptedRefresh, expiresAt, row.id]);

      refreshed++;
      const wasExpired = row.token_expires_at && new Date(row.token_expires_at) < new Date();
      console.log(`[OAuth Refresh] ${wasExpired ? 'Recovered expired' : 'Refreshed'} token for ${row.platform} (user ${row.user_id}), new expiry: ${expiresAt?.toISOString() || 'unknown'}`);
    } catch (err: any) {
      failed++;
      console.error(`[OAuth Refresh] Failed for ${row.platform} (user ${row.user_id}):`, err.message);
      await pool.query(
        `UPDATE integration_configs SET error_message = $1, updated_at = NOW() WHERE id = $2`,
        [`Token refresh failed: ${err.message}`, row.id]
      );
    }
  }

  return { refreshed, failed };
}
