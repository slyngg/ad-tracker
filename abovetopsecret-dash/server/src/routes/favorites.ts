import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/favorites
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'SELECT * FROM user_favorites WHERE user_id = $1 ORDER BY position ASC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching favorites:', err);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// POST /api/favorites
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { metric_key, display_name } = req.body;
    if (!metric_key) return res.status(400).json({ error: 'metric_key required' });

    const maxPos = await pool.query('SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM user_favorites WHERE user_id = $1', [userId]);
    const result = await pool.query(
      `INSERT INTO user_favorites (user_id, metric_key, display_name, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, metric_key) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING *`,
      [userId, metric_key, display_name || metric_key, maxPos.rows[0].next_pos]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating favorite:', err);
    res.status(500).json({ error: 'Failed to create favorite' });
  }
});

// PUT /api/favorites/reorder
router.put('/reorder', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { items } = req.body; // [{id, position}]
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items array required' });

    for (const item of items) {
      await pool.query('UPDATE user_favorites SET position = $1 WHERE id = $2 AND user_id = $3', [item.position, item.id, userId]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering favorites:', err);
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

// DELETE /api/favorites/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM user_favorites WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting favorite:', err);
    res.status(500).json({ error: 'Failed to delete favorite' });
  }
});

export default router;
