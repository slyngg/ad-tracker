import { Router, Request, Response } from 'express';
import pool from '../db';
import { computeRFMScores, ensurePresetSegments } from '../services/rfm-compute';

const router = Router();

// GET /api/rfm/segments
router.get('/segments', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (userId) await ensurePresetSegments(userId);
    const result = await pool.query('SELECT * FROM rfm_segments WHERE user_id = $1 ORDER BY id', [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching RFM segments:', err);
    res.status(500).json({ error: 'Failed to fetch segments' });
  }
});

// POST /api/rfm/segments
router.post('/segments', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { segment_name, segment_label, recency_min, recency_max, frequency_min, frequency_max, monetary_min, monetary_max, color } = req.body;
    const result = await pool.query(`
      INSERT INTO rfm_segments (user_id, segment_name, segment_label, recency_min, recency_max, frequency_min, frequency_max, monetary_min, monetary_max, color, is_preset)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false) RETURNING *
    `, [userId, segment_name, segment_label, recency_min, recency_max, frequency_min, frequency_max, monetary_min, monetary_max, color || '#3b82f6']);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating segment:', err);
    res.status(500).json({ error: 'Failed to create segment' });
  }
});

// PUT /api/rfm/segments/:id
router.put('/segments/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { segment_name, segment_label, recency_min, recency_max, frequency_min, frequency_max, monetary_min, monetary_max, color } = req.body;
    await pool.query(`
      UPDATE rfm_segments SET segment_name=$2, segment_label=$3, recency_min=$4, recency_max=$5, frequency_min=$6, frequency_max=$7, monetary_min=$8, monetary_max=$9, color=$10, updated_at=NOW()
      WHERE id=$1 AND user_id=$11
    `, [parseInt(req.params.id), segment_name, segment_label, recency_min, recency_max, frequency_min, frequency_max, monetary_min, monetary_max, color, userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating segment:', err);
    res.status(500).json({ error: 'Failed to update segment' });
  }
});

// DELETE /api/rfm/segments/:id
router.delete('/segments/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query('DELETE FROM rfm_segments WHERE id = $1 AND user_id = $2 AND is_preset = false', [parseInt(req.params.id), userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting segment:', err);
    res.status(500).json({ error: 'Failed to delete segment' });
  }
});

// GET /api/rfm/customers?segment=1&page=1&limit=50
router.get('/customers', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const segmentId = req.query.segment ? parseInt(req.query.segment as string) : null;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM customer_rfm WHERE user_id = $1';
    const params: any[] = [userId];
    if (segmentId) { query += ' AND segment_id = $2'; params.push(segmentId); }
    query += ` ORDER BY monetary DESC LIMIT ${limit} OFFSET ${offset}`;

    const result = await pool.query(query, params);
    const countQ = segmentId
      ? await pool.query('SELECT COUNT(*) FROM customer_rfm WHERE user_id = $1 AND segment_id = $2', [userId, segmentId])
      : await pool.query('SELECT COUNT(*) FROM customer_rfm WHERE user_id = $1', [userId]);

    res.json({ customers: result.rows, total: parseInt(countQ.rows[0].count), page, limit });
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// POST /api/rfm/compute
router.post('/compute', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    const result = await computeRFMScores(userId);
    res.json(result);
  } catch (err) {
    console.error('Error computing RFM:', err);
    res.status(500).json({ error: 'RFM computation failed' });
  }
});

// GET /api/rfm/overview
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(`
      SELECT
        COUNT(*) AS total_customers,
        AVG(monetary) AS avg_ltv,
        AVG(frequency) AS avg_frequency,
        AVG(recency_days) AS avg_recency
      FROM customer_rfm WHERE user_id = $1
    `, [userId]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching RFM overview:', err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

export default router;
