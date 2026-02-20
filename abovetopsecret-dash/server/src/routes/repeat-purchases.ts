import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/repeat-purchases
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'SELECT * FROM repeat_purchases WHERE user_id = $1 ORDER BY cohort_month ASC, order_number ASC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching repeat purchases:', err);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// GET /api/repeat-purchases/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const ufAnd = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const result = await pool.query(`
      WITH customer_orders AS (
        SELECT customer_email, COUNT(DISTINCT order_id) AS order_count
        FROM cc_orders_today
        WHERE order_status = 'completed' AND customer_email IS NOT NULL ${ufAnd}
        GROUP BY customer_email
      )
      SELECT
        COUNT(*) AS total_customers,
        COUNT(*) FILTER (WHERE order_count > 1) AS repeat_customers,
        CASE WHEN COUNT(*) > 0 THEN COUNT(*) FILTER (WHERE order_count > 1)::NUMERIC / COUNT(*) * 100 ELSE 0 END AS repeat_rate,
        AVG(order_count) AS avg_orders_per_customer
      FROM customer_orders
    `, params);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching repeat purchase summary:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// POST /api/repeat-purchases/compute
router.post('/compute', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    // Compute repeat purchase data from orders
    await pool.query(`
      INSERT INTO repeat_purchases (user_id, cohort_month, order_number, customer_count, total_revenue, computed_at)
      SELECT $1, cohort_month, order_number, COUNT(*), SUM(revenue), NOW()
      FROM (
        SELECT
          customer_email,
          DATE_TRUNC('month', MIN(created_at))::DATE AS cohort_month,
          ROW_NUMBER() OVER (PARTITION BY customer_email ORDER BY created_at) AS order_number,
          COALESCE(subtotal, revenue) AS revenue
        FROM cc_orders_today
        WHERE order_status = 'completed' AND customer_email IS NOT NULL AND user_id = $1
      ) sub
      GROUP BY cohort_month, order_number
      ON CONFLICT (user_id, cohort_month, order_number) DO UPDATE SET
        customer_count = EXCLUDED.customer_count, total_revenue = EXCLUDED.total_revenue, computed_at = NOW()
    `, [userId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error computing repeat purchases:', err);
    res.status(500).json({ error: 'Computation failed' });
  }
});

export default router;
