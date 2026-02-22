import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { authMiddleware } from '../middleware/auth';
import {
  getProvider,
  isOAuthPlatform,
  getRedirectUri,
  encrypt,
  decrypt,
  OAUTH_PLATFORMS,
} from '../services/oauth-providers';
import { triggerPlatformSync, SyncPlatform } from '../services/immediate-sync';

const router = Router();

// ── GET /:platform/authorize — Generate state + return authUrl ──
// Requires JWT auth
router.get('/:platform/authorize', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const userId = req.user?.id;

    if (!isOAuthPlatform(platform)) {
      return res.status(400).json({ error: `Unsupported OAuth platform: ${platform}` });
    }

    const provider = getProvider(platform);
    if (!provider) return res.status(400).json({ error: 'Provider not found' });

    // Generate CSRF state
    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Store state in integration_configs (upsert)
    await pool.query(`
      INSERT INTO integration_configs (user_id, platform, oauth_state, oauth_state_expires_at, connection_method)
      VALUES ($1, $2, $3, $4, 'oauth')
      ON CONFLICT (user_id, platform) DO UPDATE SET
        oauth_state = EXCLUDED.oauth_state,
        oauth_state_expires_at = EXCLUDED.oauth_state_expires_at,
        updated_at = NOW()
    `, [userId, platform, state, expiresAt]);

    const redirectUri = getRedirectUri(platform);
    const extra: Record<string, string> = {};
    if (req.query.storeUrl) extra.storeUrl = req.query.storeUrl as string;

    const authUrl = provider.getAuthUrl(state, redirectUri, extra);
    res.json({ authUrl });
  } catch (err) {
    console.error('[OAuth] authorize error:', err);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// ── GET /:platform/callback — Exchange code, store tokens ───────
// PUBLIC endpoint (no auth — user is coming back from provider redirect)
router.get('/:platform/callback', async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.status(400).send(callbackHtml(false, `Authorization denied: ${oauthError}`));
    }

    if (!code || !state) {
      return res.status(400).send(callbackHtml(false, 'Missing code or state parameter'));
    }

    if (!isOAuthPlatform(platform)) {
      return res.status(400).send(callbackHtml(false, `Unsupported platform: ${platform}`));
    }

    // Look up state to find the user
    const stateResult = await pool.query(
      `SELECT id, user_id, config FROM integration_configs
       WHERE oauth_state = $1 AND platform = $2 AND oauth_state_expires_at > NOW()`,
      [state, platform]
    );

    if (stateResult.rows.length === 0) {
      return res.status(400).send(callbackHtml(false, 'Invalid or expired state. Please try connecting again.'));
    }

    const row = stateResult.rows[0];
    const userId = row.user_id;
    const existingConfig = row.config || {};

    const provider = getProvider(platform)!;
    const redirectUri = getRedirectUri(platform);

    // Extra params (e.g. Shopify store URL from config)
    const extra: Record<string, string> = {};
    if (existingConfig.storeUrl) extra.storeUrl = existingConfig.storeUrl;
    // Also check query params for shop (Shopify sends it back)
    if (req.query.shop) extra.storeUrl = req.query.shop as string;

    // Exchange the code for tokens
    const tokens = await provider.exchangeCode(code as string, redirectUri, extra);

    // Encrypt tokens
    const encryptedAccess = encrypt(tokens.access_token);
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Update integration_configs with tokens
    await pool.query(`
      UPDATE integration_configs SET
        credentials = $1,
        status = 'connected',
        connection_method = 'oauth',
        oauth_state = NULL,
        oauth_state_expires_at = NULL,
        refresh_token_encrypted = $2,
        token_expires_at = $3,
        token_refreshed_at = NOW(),
        scopes = $4,
        error_message = NULL,
        updated_at = NOW()
      WHERE user_id = $5 AND platform = $6
    `, [
      JSON.stringify({ access_token_encrypted: encryptedAccess, ...(tokens.raw || {}) }),
      encryptedRefresh,
      expiresAt,
      tokens.scopes || [],
      userId,
      platform,
    ]);

    res.send(callbackHtml(true, 'Connected successfully!'));

    // Trigger immediate data sync (fire-and-forget, don't block callback)
    if (userId) {
      triggerPlatformSync(userId, platform as SyncPlatform);
    }
  } catch (err: any) {
    console.error('[OAuth] callback error:', err);
    res.status(500).send(callbackHtml(false, err.message || 'Token exchange failed'));
  }
});

// ── POST /:platform/disconnect — Clear tokens ──────────────────
router.post('/:platform/disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const userId = req.user?.id;

    await pool.query(`
      UPDATE integration_configs SET
        status = 'disconnected',
        credentials = '{}',
        refresh_token_encrypted = NULL,
        token_expires_at = NULL,
        scopes = NULL,
        updated_at = NOW()
      WHERE user_id = $1 AND platform = $2
    `, [userId, platform]);

    res.json({ success: true });
  } catch (err) {
    console.error('[OAuth] disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ── POST /:platform/refresh — Refresh expired token ────────────
router.post('/:platform/refresh', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const userId = req.user?.id;

    if (!isOAuthPlatform(platform)) {
      return res.status(400).json({ error: 'Unsupported platform' });
    }

    const provider = getProvider(platform)!;
    if (!provider.refreshToken) {
      return res.status(400).json({ error: `${platform} does not support token refresh` });
    }

    const result = await pool.query(
      'SELECT refresh_token_encrypted, credentials FROM integration_configs WHERE user_id = $1 AND platform = $2',
      [userId, platform]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No connection found' });
    }

    const row = result.rows[0];
    let refreshTokenValue: string;

    if (row.refresh_token_encrypted) {
      refreshTokenValue = decrypt(row.refresh_token_encrypted);
    } else if (platform === 'meta') {
      // Meta uses the current access token for refresh
      const creds = row.credentials || {};
      if (!creds.access_token_encrypted) return res.status(400).json({ error: 'No token to refresh' });
      refreshTokenValue = decrypt(creds.access_token_encrypted);
    } else {
      return res.status(400).json({ error: 'No refresh token available' });
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
      WHERE user_id = $4 AND platform = $5
    `, [
      JSON.stringify(encryptedAccess),
      encryptedRefresh,
      expiresAt,
      userId,
      platform,
    ]);

    res.json({ success: true, expiresAt });
  } catch (err: any) {
    console.error('[OAuth] refresh error:', err);
    res.status(500).json({ error: err.message || 'Token refresh failed' });
  }
});

// ── GET /status — All platforms' connection status ──────────────
router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const result = await pool.query(
      `SELECT platform, status, connection_method, token_expires_at, scopes, error_message, updated_at
       FROM integration_configs WHERE user_id = $1`,
      [userId]
    );

    const statusMap = OAUTH_PLATFORMS.map(platform => {
      const row = result.rows.find(r => r.platform === platform);
      if (!row) return { platform, status: 'disconnected', connectionMethod: 'none' };

      // If the token has expired, report as expired (not connected)
      let status = row.status;
      let error = row.error_message;
      if (status === 'connected' && row.token_expires_at && new Date(row.token_expires_at) < new Date()) {
        status = 'expired';
        error = error || 'Token expired — please reconnect';
      }

      return {
        platform: row.platform,
        status,
        connectionMethod: row.connection_method || 'manual',
        tokenExpiresAt: row.token_expires_at,
        scopes: row.scopes,
        error,
        updatedAt: row.updated_at,
      };
    });

    res.json(statusMap);
  } catch (err) {
    console.error('[OAuth] status error:', err);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// ── Callback HTML ───────────────────────────────────────────────
function callbackHtml(success: boolean, message: string): string {
  return `<!DOCTYPE html>
<html><head><title>OAuth ${success ? 'Success' : 'Error'}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0f1117; color: #e5e7eb; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { text-align: center; padding: 2rem; }
  .icon { font-size: 3rem; margin-bottom: 1rem; }
  .msg { font-size: 1rem; margin-bottom: 1rem; }
  .sub { font-size: 0.8rem; color: #9ca3af; }
</style></head><body>
<div class="card">
  <div class="icon">${success ? '&#10004;' : '&#10006;'}</div>
  <div class="msg">${message}</div>
  <div class="sub">This window will close automatically...</div>
</div>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'oauth-callback', success: ${success}, message: '${message.replace(/'/g, "\\'")}' }, '*');
  }
  setTimeout(function() { window.close(); }, 1500);
</script>
</body></html>`;
}

export default router;
