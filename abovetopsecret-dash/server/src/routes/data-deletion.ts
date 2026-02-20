import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/requests', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM data_deletion_requests WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching deletion requests:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/request', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const result = await pool.query(
      'INSERT INTO data_deletion_requests (user_id, customer_email) VALUES ($1, $2) RETURNING *',
      [userId, email]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating deletion request:', err);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

router.post('/process/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const requestId = parseInt(req.params.id);

    const reqResult = await pool.query('SELECT * FROM data_deletion_requests WHERE id = $1 AND user_id = $2', [requestId, userId]);
    if (!reqResult.rows.length) return res.status(404).json({ error: 'Request not found' });

    const email = reqResult.rows[0].customer_email;
    const log: Record<string, number> = {};

    // Delete from cc_orders_today
    const r1 = await pool.query('DELETE FROM cc_orders_today WHERE customer_email = $1 AND user_id = $2', [email, userId]);
    log.cc_orders = r1.rowCount || 0;

    // Delete from customer_rfm
    const r2 = await pool.query('DELETE FROM customer_rfm WHERE customer_email = $1 AND user_id = $2', [email, userId]);
    log.customer_rfm = r2.rowCount || 0;

    // Mark as completed
    await pool.query(
      "UPDATE data_deletion_requests SET status = 'completed', completed_at = NOW(), deletion_log = $1 WHERE id = $2",
      [JSON.stringify(log), requestId]
    );

    res.json({ success: true, deleted: log });
  } catch (err) {
    console.error('Error processing deletion:', err);
    res.status(500).json({ error: 'Processing failed' });
  }
});

export default router;
