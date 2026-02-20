import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getSetting } from '../services/settings';
import { JWT_SECRET } from '../routes/auth';
import pool from '../db';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: { id: number | null; email?: string };
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Check for API key first (X-API-Key header)
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    try {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const result = await pool.query(
        `SELECT ak.id, ak.user_id FROM api_keys ak
         WHERE ak.key_hash = $1 AND ak.revoked_at IS NULL`,
        [keyHash]
      );
      if (result.rows.length > 0) {
        req.user = { id: result.rows[0].user_id };
        // Update last_used_at
        await pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [result.rows[0].id]);
        next();
        return;
      }
    } catch {
      // Fall through to other auth methods
    }
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  const header = req.headers.authorization;

  // No auth header — check dev mode (legacy: no token set means no auth)
  if (!header || !header.startsWith('Bearer ')) {
    const authToken = await getSetting('auth_token');
    if (!authToken) {
      // Dev mode: no auth required, no user scope
      req.user = { id: null };
      next();
      return;
    }
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);

  // Try JWT first
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };
    req.user = { id: payload.userId, email: payload.email };
    next();
    return;
  } catch {
    // Not a valid JWT, try legacy token
  }

  // Legacy token auth
  const authToken = await getSetting('auth_token');
  if (!authToken) {
    // Dev mode with a non-JWT token — allow but no user scope
    req.user = { id: null };
    next();
    return;
  }

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(authToken);
  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Legacy token valid — no user scope
  req.user = { id: null };
  next();
}
