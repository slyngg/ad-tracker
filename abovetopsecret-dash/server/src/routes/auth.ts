import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db';

const router = Router();

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET: string = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

interface JWTPayload {
  userId: number;
  email: string;
}

function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function hasConnectedProvider(userId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM integration_configs WHERE user_id = $1 AND status = 'connected' LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Check for existing user
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, onboarding_completed, created_at`,
      [email.toLowerCase(), passwordHash, displayName || email.split('@')[0]]
    );

    const user = result.rows[0];
    const token = signToken({ userId: user.id, email: user.email });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        onboardingCompleted: user.onboarding_completed ?? false,
        hasConnectedProvider: false,
      },
    });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await pool.query(
      'SELECT id, email, password_hash, display_name, onboarding_completed FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Update last login
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signToken({ userId: user.id, email: user.email });
    const connected = await hasConnectedProvider(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        onboardingCompleted: user.onboarding_completed ?? false,
        hasConnectedProvider: connected,
      },
    });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me — requires JWT (applied manually since auth middleware applies after)
router.get('/me', async (req: Request, res: Response) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const token = header.slice(7);
    let payload: JWTPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const result = await pool.query(
      'SELECT id, email, display_name, onboarding_completed, created_at, last_login_at FROM users WHERE id = $1',
      [payload.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    const connected = await hasConnectedProvider(user.id);
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      onboardingCompleted: user.onboarding_completed ?? false,
      hasConnectedProvider: connected,
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/auth/me — update profile
router.put('/me', async (req: Request, res: Response) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const token = header.slice(7);
    let payload: JWTPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const { displayName, password, currentPassword } = req.body;

    if (password) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password required to change password' });
        return;
      }

      const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [payload.userId]);
      if (userResult.rows.length === 0) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const valid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters' });
        return;
      }

      const newHash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, payload.userId]);
    }

    if (displayName !== undefined) {
      await pool.query('UPDATE users SET display_name = $1 WHERE id = $2', [displayName, payload.userId]);
    }

    const result = await pool.query(
      'SELECT id, email, display_name FROM users WHERE id = $1',
      [payload.userId]
    );

    res.json({
      id: result.rows[0].id,
      email: result.rows[0].email,
      displayName: result.rows[0].display_name,
    });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
export { JWT_SECRET };
