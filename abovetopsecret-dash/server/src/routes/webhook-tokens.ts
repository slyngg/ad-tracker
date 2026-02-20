import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';

const router = Router();

// GET /api/webhook-tokens — list user's tokens
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, source, label, active, last_used_at, created_at
       FROM webhook_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching webhook tokens:', err);
    res.status(500).json({ error: 'Failed to fetch webhook tokens' });
  }
});

// POST /api/webhook-tokens — generate token
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { source, label } = req.body;

    if (!source) {
      res.status(400).json({ error: 'source is required (e.g. checkout_champ, shopify)' });
      return;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const result = await pool.query(
      `INSERT INTO webhook_tokens (user_id, token, source, label)
       VALUES ($1, $2, $3, $4)
       RETURNING id, source, label, active, last_used_at, created_at`,
      [userId, tokenHash, source, label || null]
    );

    // Return the raw token to the user — this is the only time they will see it
    res.status(201).json({ ...result.rows[0], token: rawToken });
  } catch (err) {
    console.error('Error creating webhook token:', err);
    res.status(500).json({ error: 'Failed to create webhook token' });
  }
});

// DELETE /api/webhook-tokens/:id — revoke (set active = false)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE webhook_tokens SET active = false
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Token not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error revoking webhook token:', err);
    res.status(500).json({ error: 'Failed to revoke token' });
  }
});

export default router;
