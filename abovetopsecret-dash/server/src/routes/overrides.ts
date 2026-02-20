import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/overrides
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const result = userId
      ? await pool.query(
          'SELECT id, metric_key, offer_name, override_value, set_by, set_at FROM manual_overrides WHERE user_id = $1 ORDER BY set_at DESC',
          [userId]
        )
      : await pool.query(
          'SELECT id, metric_key, offer_name, override_value, set_by, set_at FROM manual_overrides WHERE user_id IS NULL ORDER BY set_at DESC'
        );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching overrides:', err);
    res.status(500).json({ error: 'Failed to fetch overrides' });
  }
});

// POST /api/overrides
router.post('/', async (req: Request, res: Response) => {
  try {
    const { metric_key, offer_name, override_value, set_by } = req.body;
    const userId = (req as any).user?.id as number | undefined;

    if (!metric_key || override_value === undefined) {
      res.status(400).json({ error: 'metric_key and override_value are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO manual_overrides (metric_key, offer_name, override_value, set_by, user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (metric_key, offer_name) DO UPDATE SET
         override_value = EXCLUDED.override_value,
         set_by = EXCLUDED.set_by,
         set_at = NOW()
       RETURNING *`,
      [metric_key, offer_name || 'ALL', override_value, set_by || 'admin', userId || null]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating override:', err);
    res.status(500).json({ error: 'Failed to create override' });
  }
});

// DELETE /api/overrides/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id as number | undefined;
    if (userId) {
      await pool.query('DELETE FROM manual_overrides WHERE id = $1 AND user_id = $2', [id, userId]);
    } else {
      await pool.query('DELETE FROM manual_overrides WHERE id = $1 AND user_id IS NULL', [id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting override:', err);
    res.status(500).json({ error: 'Failed to delete override' });
  }
});

export default router;
