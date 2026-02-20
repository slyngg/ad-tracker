import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';

const router = Router();

// GET /api/keys - List user's API keys (prefix, name, dates - not full key)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching API keys:', err);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

// POST /api/keys - Generate a new API key
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // Generate key
    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = rawKey.substring(0, 8) + '...';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const result = await pool.query(
      `INSERT INTO api_keys (user_id, name, key_hash, key_prefix)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, key_prefix, created_at`,
      [userId, name, keyHash, keyPrefix]
    );

    // Return the full key only once - it cannot be retrieved again
    res.status(201).json({
      ...result.rows[0],
      key: rawKey,
      message: 'Store this key securely. It will not be shown again.',
    });
  } catch (err) {
    console.error('Error generating API key:', err);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

// DELETE /api/keys/:id - Revoke an API key (set revoked_at)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE api_keys SET revoked_at = NOW()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id, name, revoked_at`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'API key not found or already revoked' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error revoking API key:', err);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export default router;
