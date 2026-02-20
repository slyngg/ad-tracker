import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM global_filters WHERE user_id = $1 ORDER BY is_default DESC, name', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching filters:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, filter_config } = req.body;
    if (!name || !filter_config) return res.status(400).json({ error: 'name and filter_config required' });

    const result = await pool.query(
      'INSERT INTO global_filters (user_id, name, filter_config) VALUES ($1, $2, $3) ON CONFLICT (user_id, name) DO UPDATE SET filter_config = EXCLUDED.filter_config RETURNING *',
      [userId, name, JSON.stringify(filter_config)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating filter:', err);
    res.status(500).json({ error: 'Failed to create' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, filter_config } = req.body;
    await pool.query('UPDATE global_filters SET name=COALESCE($1,name), filter_config=COALESCE($2,filter_config) WHERE id=$3 AND user_id=$4',
      [name, filter_config ? JSON.stringify(filter_config) : null, parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating filter:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM global_filters WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting filter:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

router.post('/:id/set-default', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('UPDATE global_filters SET is_default = false WHERE user_id = $1', [userId]);
    await pool.query('UPDATE global_filters SET is_default = true WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error setting default filter:', err);
    res.status(500).json({ error: 'Failed to set default' });
  }
});

export default router;
