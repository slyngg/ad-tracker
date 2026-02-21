import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/brand-configs — list user's brand configs
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, name, brand_name, logo_url, brand_colors, tone_of_voice,
              target_audience, usp, guidelines, is_default, created_at, updated_at
       FROM brand_configs
       WHERE user_id = $1
       ORDER BY is_default DESC, created_at ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching brand configs:', err);
    res.status(500).json({ error: 'Failed to fetch brand configs' });
  }
});

// POST /api/brand-configs — create brand config
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, brand_name, logo_url, brand_colors, tone_of_voice, target_audience, usp, guidelines } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // Check if user has any configs — if not, make this one default
    const existing = await pool.query('SELECT COUNT(*) FROM brand_configs WHERE user_id = $1', [userId]);
    const isFirst = parseInt(existing.rows[0].count) === 0;

    const result = await pool.query(
      `INSERT INTO brand_configs (user_id, name, brand_name, logo_url, brand_colors, tone_of_voice, target_audience, usp, guidelines, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId, name,
        brand_name || '', logo_url || '', brand_colors || '',
        tone_of_voice || '', target_audience || '', usp || '', guidelines || '',
        isFirst,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating brand config:', err);
    res.status(500).json({ error: 'Failed to create brand config' });
  }
});

// PUT /api/brand-configs/:id — update brand config
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, brand_name, logo_url, brand_colors, tone_of_voice, target_audience, usp, guidelines } = req.body;

    const result = await pool.query(
      `UPDATE brand_configs
       SET name = COALESCE($1, name),
           brand_name = COALESCE($2, brand_name),
           logo_url = COALESCE($3, logo_url),
           brand_colors = COALESCE($4, brand_colors),
           tone_of_voice = COALESCE($5, tone_of_voice),
           target_audience = COALESCE($6, target_audience),
           usp = COALESCE($7, usp),
           guidelines = COALESCE($8, guidelines),
           updated_at = NOW()
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [name, brand_name, logo_url, brand_colors, tone_of_voice, target_audience, usp, guidelines, id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Brand config not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating brand config:', err);
    res.status(500).json({ error: 'Failed to update brand config' });
  }
});

// DELETE /api/brand-configs/:id — delete brand config
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM brand_configs WHERE id = $1 AND user_id = $2 RETURNING id, is_default',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Brand config not found' });
      return;
    }

    // If we deleted the default, promote the oldest remaining config
    if (result.rows[0].is_default) {
      await pool.query(
        `UPDATE brand_configs SET is_default = true, updated_at = NOW()
         WHERE user_id = $1 AND id = (
           SELECT id FROM brand_configs WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1
         )`,
        [userId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting brand config:', err);
    res.status(500).json({ error: 'Failed to delete brand config' });
  }
});

// POST /api/brand-configs/:id/set-default — mark as default
router.post('/:id/set-default', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    // Verify ownership
    const check = await pool.query('SELECT id FROM brand_configs WHERE id = $1 AND user_id = $2', [id, userId]);
    if (check.rows.length === 0) {
      res.status(404).json({ error: 'Brand config not found' });
      return;
    }

    // Unset all defaults for this user, then set the new one
    await pool.query('UPDATE brand_configs SET is_default = false, updated_at = NOW() WHERE user_id = $1', [userId]);
    await pool.query('UPDATE brand_configs SET is_default = true, updated_at = NOW() WHERE id = $1 AND user_id = $2', [id, userId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error setting default brand config:', err);
    res.status(500).json({ error: 'Failed to set default' });
  }
});

export default router;
