import { Router, Request, Response } from 'express';
import pool from '../db';
import { parseAccountFilter } from '../services/account-filter';

const router = Router();

// GET /api/costs - List cost settings for user
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const af = parseAccountFilter(req.query as Record<string, any>, 2);
    const result = await pool.query(
      `SELECT id, offer_name, cost_type, cost_value, cost_unit, notes, created_at, updated_at
       FROM cost_settings
       WHERE user_id = $1 ${af.clause}
       ORDER BY offer_name ASC, created_at DESC`,
      [userId, ...af.params]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching cost settings:', err);
    res.status(500).json({ error: 'Failed to fetch cost settings' });
  }
});

// POST /api/costs - Create or update a cost setting
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id, offer_name, cost_type, cost_value, cost_unit, notes } = req.body;

    if (!offer_name || !cost_type || cost_value === undefined) {
      res.status(400).json({ error: 'offer_name, cost_type, and cost_value are required' });
      return;
    }

    let result;
    if (id) {
      // Update existing
      result = await pool.query(
        `UPDATE cost_settings
         SET offer_name = $1, cost_type = $2, cost_value = $3, cost_unit = $4, notes = $5, updated_at = NOW()
         WHERE id = $6 AND user_id = $7
         RETURNING *`,
        [offer_name, cost_type, cost_value, cost_unit || null, notes || null, id, userId]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Cost setting not found' });
        return;
      }
    } else {
      // Create new
      result = await pool.query(
        `INSERT INTO cost_settings (user_id, offer_name, cost_type, cost_value, cost_unit, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, offer_name, cost_type, cost_value, cost_unit || null, notes || null]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving cost setting:', err);
    res.status(500).json({ error: 'Failed to save cost setting' });
  }
});

// DELETE /api/costs/:id - Remove a cost setting
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM cost_settings WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Cost setting not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting cost setting:', err);
    res.status(500).json({ error: 'Failed to delete cost setting' });
  }
});

export default router;
