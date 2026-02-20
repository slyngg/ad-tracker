import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getSetting } from '../services/settings';

export async function verifyCheckoutChamp(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secret = await getSetting('cc_webhook_secret');
  if (!secret) {
    // No secret configured, allow in dev mode
    next();
    return;
  }

  const signature = req.headers['x-cc-signature'] as string;
  if (!signature) {
    res.status(401).json({ error: 'Missing X-CC-Signature header' });
    return;
  }

  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

export async function verifyShopify(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secret = await getSetting('shopify_webhook_secret');
  if (!secret) {
    next();
    return;
  }

  const hmacHeader = req.headers['x-shopify-hmac-sha256'] as string;
  if (!hmacHeader) {
    res.status(401).json({ error: 'Missing X-Shopify-Hmac-Sha256 header' });
    return;
  }

  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected))) {
    res.status(401).json({ error: 'Invalid HMAC' });
    return;
  }

  next();
}
