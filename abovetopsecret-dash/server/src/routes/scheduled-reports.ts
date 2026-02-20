import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM scheduled_reports WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, report_type, schedule, delivery_channel, delivery_config, report_config } = req.body;
    if (!name || !report_type || !schedule || !delivery_channel) {
      return res.status(400).json({ error: 'name, report_type, schedule, and delivery_channel are required' });
    }
    const result = await pool.query(`
      INSERT INTO scheduled_reports (user_id, name, report_type, schedule, delivery_channel, delivery_config, report_config)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [userId, name, report_type, schedule, delivery_channel, JSON.stringify(delivery_config || {}), JSON.stringify(report_config || {})]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating report:', err);
    res.status(500).json({ error: 'Failed to create report' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, schedule, delivery_channel, delivery_config, report_config, enabled } = req.body;
    await pool.query(`
      UPDATE scheduled_reports SET name=COALESCE($1,name), schedule=COALESCE($2,schedule),
        delivery_channel=COALESCE($3,delivery_channel), delivery_config=COALESCE($4,delivery_config),
        report_config=COALESCE($5,report_config), enabled=COALESCE($6,enabled), updated_at=NOW()
      WHERE id=$7 AND user_id=$8
    `, [name, schedule, delivery_channel, delivery_config ? JSON.stringify(delivery_config) : null, report_config ? JSON.stringify(report_config) : null, enabled, parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating report:', err);
    res.status(500).json({ error: 'Failed to update' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM scheduled_reports WHERE id = $1 AND user_id = $2', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

router.post('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'UPDATE scheduled_reports SET enabled = NOT enabled, updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *',
      [parseInt(req.params.id), userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error toggling report:', err);
    res.status(500).json({ error: 'Failed to toggle' });
  }
});

export default router;
