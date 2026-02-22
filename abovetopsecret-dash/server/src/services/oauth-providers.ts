import crypto from 'crypto';
import https from 'https';

// ── Encryption ──────────────────────────────────────────────────

const ENCRYPTION_KEY = process.env.OAUTH_ENCRYPTION_KEY || '';

function getKeyBuffer(): Buffer {
  if (!ENCRYPTION_KEY) throw new Error('OAUTH_ENCRYPTION_KEY not set');
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

export function encrypt(plaintext: string): string {
  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv:tag:ciphertext, all base64
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(encoded: string): string {
  const key = getKeyBuffer();
  const [ivB64, tagB64, dataB64] = encoded.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}

// ── HTTP helper ─────────────────────────────────────────────────

function httpsRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Non-JSON response: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ── Provider types ──────────────────────────────────────────────

export interface OAuthTokenResult {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;    // seconds
  scopes?: string[];
  raw?: any;
}

export type OAuthPlatform = 'meta' | 'google' | 'shopify' | 'tiktok' | 'klaviyo';

export const OAUTH_PLATFORMS: OAuthPlatform[] = ['meta', 'google', 'shopify', 'tiktok', 'klaviyo'];

interface ProviderConfig {
  getAuthUrl(state: string, redirectUri: string, extra?: Record<string, string>): string;
  exchangeCode(code: string, redirectUri: string, extra?: Record<string, string>): Promise<OAuthTokenResult>;
  refreshToken?(refreshToken: string): Promise<OAuthTokenResult>;
  scopes: string[];
}

// ── Redirect URI helper ─────────────────────────────────────────

export function getRedirectUri(platform: string): string {
  const base = process.env.DASHBOARD_URL || process.env.ALLOWED_ORIGIN || 'http://localhost:4000';
  return `${base.split(',')[0].trim()}/api/oauth/${platform}/callback`;
}

// ── Meta ────────────────────────────────────────────────────────

const meta: ProviderConfig = {
  scopes: ['ads_read', 'ads_management', 'read_insights'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: this.scopes.join(','),
      response_type: 'code',
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    // Exchange auth code for short-lived token
    const params = new URLSearchParams({
      client_id: process.env.META_APP_ID || '',
      client_secret: process.env.META_APP_SECRET || '',
      redirect_uri: redirectUri,
      code,
    });
    const shortLived = await httpsRequest(`https://graph.facebook.com/v21.0/oauth/access_token?${params}`);
    if (shortLived.error) throw new Error(shortLived.error.message || 'Meta token exchange failed');

    if (!shortLived.access_token) {
      throw new Error('Meta OAuth returned no access_token in short-lived exchange');
    }

    // Exchange short-lived for long-lived (60-day) token
    const llParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID || '',
      client_secret: process.env.META_APP_SECRET || '',
      fb_exchange_token: shortLived.access_token,
    });
    const longLived = await httpsRequest(`https://graph.facebook.com/v21.0/oauth/access_token?${llParams}`);
    if (longLived.error) {
      console.error('[Meta OAuth] Long-lived token exchange failed:', longLived.error);
      throw new Error(longLived.error.message || 'Meta long-lived token exchange failed');
    }

    if (!longLived.access_token) {
      console.error('[Meta OAuth] Long-lived exchange returned no access_token:', longLived);
      throw new Error('Meta long-lived token exchange returned no access_token');
    }

    // Meta long-lived tokens last ~60 days (5184000 seconds)
    const expiresIn = longLived.expires_in || 5184000;
    console.log(`[Meta OAuth] Obtained long-lived token, expires_in=${expiresIn}s (~${Math.round(expiresIn / 86400)}d)`);

    return {
      access_token: longLived.access_token,
      expires_in: expiresIn,
      scopes: this.scopes,
      raw: longLived,
    };
  },

  // Meta doesn't use refresh tokens — re-exchange the long-lived token
  async refreshToken(currentToken) {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: process.env.META_APP_ID || '',
      client_secret: process.env.META_APP_SECRET || '',
      fb_exchange_token: currentToken,
    });
    const result = await httpsRequest(`https://graph.facebook.com/v21.0/oauth/access_token?${params}`);
    if (result.error) throw new Error(result.error.message || 'Meta token refresh failed');

    const expiresIn = result.expires_in || 5184000;
    console.log(`[Meta OAuth] Refreshed long-lived token, expires_in=${expiresIn}s (~${Math.round(expiresIn / 86400)}d)`);

    return {
      access_token: result.access_token,
      expires_in: expiresIn,
      scopes: this.scopes,
    };
  },
};

// ── Google ───────────────────────────────────────────────────────

const google: ProviderConfig = {
  scopes: ['https://www.googleapis.com/auth/analytics.readonly'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: this.scopes.join(' '),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    }).toString();

    const result = await httpsRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (result.error) throw new Error(result.error_description || result.error);

    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in || 3600,
      scopes: this.scopes,
      raw: result,
    };
  },

  async refreshToken(refreshToken) {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString();

    const result = await httpsRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (result.error) throw new Error(result.error_description || result.error);

    return {
      access_token: result.access_token,
      expires_in: result.expires_in || 3600,
      scopes: this.scopes,
    };
  },
};

// ── Shopify ─────────────────────────────────────────────────────

const shopify: ProviderConfig = {
  scopes: ['read_orders', 'read_products'],

  getAuthUrl(state, redirectUri, extra) {
    const store = extra?.storeUrl || '';
    const params = new URLSearchParams({
      client_id: process.env.SHOPIFY_CLIENT_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: this.scopes.join(','),
    });
    return `https://${store}/admin/oauth/authorize?${params}`;
  },

  async exchangeCode(code, _redirectUri, extra) {
    const store = extra?.storeUrl || '';
    const body = JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID || '',
      client_secret: process.env.SHOPIFY_CLIENT_SECRET || '',
      code,
    });

    const result = await httpsRequest(`https://${store}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (result.errors) throw new Error(typeof result.errors === 'string' ? result.errors : JSON.stringify(result.errors));

    return {
      access_token: result.access_token,
      // Shopify tokens are permanent — no refresh needed
      scopes: (result.scope || '').split(','),
      raw: result,
    };
  },
  // No refresh for Shopify — tokens don't expire
};

// ── TikTok ──────────────────────────────────────────────────────

const tiktok: ProviderConfig = {
  scopes: ['ad.read', 'campaign.read'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      app_id: process.env.TIKTOK_APP_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: this.scopes.join(','),
      response_type: 'code',
    });
    return `https://business-api.tiktok.com/portal/auth?${params}`;
  },

  async exchangeCode(code) {
    const body = JSON.stringify({
      app_id: process.env.TIKTOK_APP_ID || '',
      secret: process.env.TIKTOK_APP_SECRET || '',
      auth_code: code,
    });

    const result = await httpsRequest('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (result.code !== 0) throw new Error(result.message || 'TikTok token exchange failed');

    const data = result.data;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in || 86400,
      scopes: this.scopes,
      raw: data,
    };
  },

  async refreshToken(refreshToken) {
    const body = JSON.stringify({
      app_id: process.env.TIKTOK_APP_ID || '',
      secret: process.env.TIKTOK_APP_SECRET || '',
      refresh_token: refreshToken,
    });

    const result = await httpsRequest('https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (result.code !== 0) throw new Error(result.message || 'TikTok token refresh failed');

    return {
      access_token: result.data.access_token,
      refresh_token: result.data.refresh_token,
      expires_in: result.data.expires_in || 86400,
      scopes: this.scopes,
    };
  },
};

// ── Klaviyo ─────────────────────────────────────────────────────

const klaviyo: ProviderConfig = {
  scopes: ['lists:read', 'profiles:read', 'campaigns:read', 'metrics:read'],

  getAuthUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.KLAVIYO_CLIENT_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: this.scopes.join(' '),
      response_type: 'code',
      code_challenge_method: 'S256',
    });
    return `https://www.klaviyo.com/oauth/authorize?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const body = new URLSearchParams({
      client_id: process.env.KLAVIYO_CLIENT_ID || '',
      client_secret: process.env.KLAVIYO_CLIENT_SECRET || '',
      redirect_uri: redirectUri,
      code,
      grant_type: 'authorization_code',
    }).toString();

    const result = await httpsRequest('https://a.klaviyo.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (result.error) throw new Error(result.error_description || result.error);

    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in || 3600,
      scopes: this.scopes,
      raw: result,
    };
  },

  async refreshToken(refreshToken) {
    const body = new URLSearchParams({
      client_id: process.env.KLAVIYO_CLIENT_ID || '',
      client_secret: process.env.KLAVIYO_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString();

    const result = await httpsRequest('https://a.klaviyo.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (result.error) throw new Error(result.error_description || result.error);

    return {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_in: result.expires_in || 3600,
      scopes: this.scopes,
    };
  },
};

// ── Provider registry ───────────────────────────────────────────

const providers: Record<OAuthPlatform, ProviderConfig> = {
  meta,
  google,
  shopify,
  tiktok,
  klaviyo,
};

export function getProvider(platform: string): ProviderConfig | undefined {
  return providers[platform as OAuthPlatform];
}

export function isOAuthPlatform(platform: string): platform is OAuthPlatform {
  return OAUTH_PLATFORMS.includes(platform as OAuthPlatform);
}
