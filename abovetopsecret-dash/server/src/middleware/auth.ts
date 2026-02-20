import { Request, Response, NextFunction } from 'express';
import { getSetting } from '../services/settings';

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authToken = await getSetting('auth_token');

  // Dev mode: if no AUTH_TOKEN is set, skip auth
  if (!authToken) {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);
  if (token !== authToken) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  next();
}
