import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { getSetting } from '../services/settings';

// JVZoo sends URL-encoded POST bodies — we need the parsed body fields for verification

// Express Request with rawBody attached by the verify callback in index.ts
interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

// Resolve webhook token to userId for user-scoped secret lookup
async function resolveTokenUserId(token: string | undefined): Promise<number | null> {
  if (!token) return null;
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      'SELECT user_id FROM webhook_tokens WHERE token = $1 AND active = true',
      [tokenHash]
    );
    if (result.rows.length > 0) {
      return result.rows[0].user_id;
    }
  } catch {
    // Table may not exist yet
  }
  return null;
}

export async function verifyCheckoutChamp(req: Request, res: Response, next: NextFunction): Promise<void> {
  // CC postbacks don't support HMAC signing — auth is via the unique webhook token URL.
  // If user has optionally configured a secret AND CC sends X-CC-Signature, verify it.
  // Otherwise, just ensure the webhook token is valid (resolveWebhookToken in handler does this).
  const token = req.params.webhookToken;
  if (!token) {
    res.status(401).json({ error: 'Missing webhook token' });
    return;
  }

  const userId = await resolveTokenUserId(token);
  if (userId === null) {
    res.status(401).json({ error: 'Invalid webhook token' });
    return;
  }

  // Optional HMAC verification if user has configured a secret
  const secret = await getSetting('cc_webhook_secret', userId);
  const signature = req.headers['x-cc-signature'] as string;
  if (secret && signature) {
    const rawBody = (req as RawBodyRequest).rawBody;
    if (!rawBody) {
      res.status(400).json({ error: 'Could not read request body for verification' });
      return;
    }
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (signature.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  next();
}

export async function verifyShopify(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = await resolveTokenUserId(req.params.webhookToken);
  const secret = await getSetting('shopify_webhook_secret', userId);
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Webhook] SHOPIFY_WEBHOOK_SECRET not configured in production — rejecting request');
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }
    next();
    return;
  }

  const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
  if (!hmacHeader) {
    res.status(401).json({ error: 'Missing X-Shopify-Hmac-Sha256 header' });
    return;
  }

  const rawBody = (req as RawBodyRequest).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: 'Could not read request body for verification' });
    return;
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');

  if (hmacHeader.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(hmacHeader, 'base64'), Buffer.from(expected, 'base64'))) {
    res.status(401).json({ error: 'Invalid HMAC' });
    return;
  }

  next();
}

export async function verifyJVZoo(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.params.webhookToken;
  if (!token) {
    res.status(401).json({ error: 'Missing webhook token' });
    return;
  }

  const userId = await resolveTokenUserId(token);
  if (userId === null) {
    res.status(401).json({ error: 'Invalid webhook token' });
    return;
  }

  const secret = await getSetting('jvzoo_secret_key', userId);
  if (!secret) {
    // No secret configured — skip verification (token auth only)
    next();
    return;
  }

  // JVZoo IPN verification:
  // 1. Sort all POST field keys (except cverify) alphabetically
  // 2. Join their values with |
  // 3. Append the secret key
  // 4. SHA1 hash → take first 8 chars → uppercase
  const body = req.body;
  const cverify = body.cverify;
  if (!cverify) {
    res.status(401).json({ error: 'Missing cverify field' });
    return;
  }

  const keys = Object.keys(body).filter(k => k !== 'cverify').sort();
  const valueString = keys.map(k => body[k]).join('|') + '|' + secret;
  const hash = crypto.createHash('sha1').update(valueString).digest('hex').substring(0, 8).toUpperCase();

  if (hash !== cverify.toUpperCase()) {
    res.status(401).json({ error: 'Invalid JVZoo IPN signature' });
    return;
  }

  next();
}

export async function verifyClickBank(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.params.webhookToken;
  if (!token) {
    res.status(401).json({ error: 'Missing webhook token' });
    return;
  }

  const userId = await resolveTokenUserId(token);
  if (userId === null) {
    res.status(401).json({ error: 'Invalid webhook token' });
    return;
  }

  const secret = await getSetting('clickbank_secret_key', userId);
  if (!secret) {
    res.status(500).json({ error: 'ClickBank secret key not configured' });
    return;
  }

  // ClickBank INS sends JSON with { iv, notification } — both AES-256-CBC encrypted
  const { iv, notification } = req.body;
  if (!iv || !notification) {
    res.status(400).json({ error: 'Missing iv or notification field' });
    return;
  }

  try {
    // Key derivation: SHA1(secret) zero-padded to 32 bytes
    const sha1 = crypto.createHash('sha1').update(secret).digest();
    const key = Buffer.alloc(32, 0);
    sha1.copy(key, 0, 0, Math.min(sha1.length, 32));

    const ivBuf = Buffer.from(iv, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, ivBuf);
    decipher.setAutoPadding(true);

    let decrypted = decipher.update(notification, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Replace request body with decrypted JSON
    req.body = JSON.parse(decrypted);
    next();
  } catch (err) {
    console.error('[ClickBank Webhook] Decryption failed:', err);
    res.status(401).json({ error: 'Failed to decrypt ClickBank notification' });
  }
}
