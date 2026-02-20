import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM brand_vault WHERE user_id = $1 ORDER BY asset_type, asset_key', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching brand vault:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { asset_type, asset_key, asset_value } = req.body;
    if (!asset_type || !asset_key || !asset_value) return res.status(400).json({ error: 'asset_type, asset_key, asset_value required' });

    const result = await pool.query(`
      INSERT INTO brand_vault (user_id, asset_type, asset_key, asset_value)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, asset_type, asset_key) DO UPDATE SET asset_value = EXCLUDED.asset_value, updated_at = NOW()
      RETURNING *
    `, [userId, asset_type, asset_key, asset_value]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving brand asset:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM brand_vault WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting brand asset:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
