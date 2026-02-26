import { Router, Request, Response } from 'express';
import pool from '../db';
import {
  fitChannelCurves,
  getResponseCurve,
  optimizeBudget,
  simulateScenario,
  getChannelEfficiency,
} from '../services/mmm-engine';

const router = Router();

// GET /api/mmm/channels — Get fitted channel curves and efficiency metrics
router.get('/channels', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const [paramsResult, efficiency] = await Promise.all([
      pool.query(
        'SELECT channel, alpha, beta, gamma, r_squared, data_points, last_fitted FROM mmm_channel_params WHERE user_id = $1 ORDER BY channel',
        [userId]
      ),
      getChannelEfficiency(userId),
    ]);

    const channels = paramsResult.rows.map(row => ({
      channel: row.channel,
      alpha: parseFloat(row.alpha),
      beta: parseFloat(row.beta),
      gamma: parseFloat(row.gamma),
      rSquared: row.r_squared ? parseFloat(row.r_squared) : null,
      dataPoints: row.data_points,
      lastFitted: row.last_fitted,
    }));

    res.json({ channels, efficiency });
  } catch (err) {
    console.error('Error fetching MMM channels:', err);
    res.status(500).json({ error: 'Failed to fetch channel data' });
  }
});

// POST /api/mmm/fit — Trigger curve fitting (re-fit)
router.post('/fit', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const results = await fitChannelCurves(userId);
    res.json({ fitted: results });
  } catch (err) {
    console.error('Error fitting MMM curves:', err);
    res.status(500).json({ error: 'Curve fitting failed' });
  }
});

// GET /api/mmm/response-curve/:channel?min=&max=&steps= — Get response curve for a channel
router.get('/response-curve/:channel', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { channel } = req.params;
    const min = parseFloat(req.query.min as string) || 0;
    const max = parseFloat(req.query.max as string) || 10000;
    const steps = Math.min(parseInt(req.query.steps as string) || 50, 200);

    const curve = await getResponseCurve(userId, channel, min, max, steps);
    res.json({ channel, curve });
  } catch (err) {
    console.error('Error fetching response curve:', err);
    res.status(500).json({ error: 'Failed to fetch response curve' });
  }
});

// POST /api/mmm/optimize?budget= — Get optimal budget allocation
router.post('/optimize', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const budget = parseFloat(req.query.budget as string) || parseFloat(req.body.budget) || 0;
    if (budget <= 0) return res.status(400).json({ error: 'Budget must be positive' });

    const allocations = await optimizeBudget(userId, budget);
    const totalRevenue = allocations.reduce((s, a) => s + a.predicted_revenue, 0);
    const totalSpend = allocations.reduce((s, a) => s + a.spend, 0);

    res.json({
      allocations,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      roas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 10000) / 10000 : 0,
    });
  } catch (err) {
    console.error('Error optimizing budget:', err);
    res.status(500).json({ error: 'Budget optimization failed' });
  }
});

// POST /api/mmm/simulate — Simulate custom allocation
router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { allocations } = req.body;
    if (!Array.isArray(allocations)) return res.status(400).json({ error: 'allocations must be an array' });

    const result = await simulateScenario(userId, allocations);
    res.json(result);
  } catch (err) {
    console.error('Error simulating scenario:', err);
    res.status(500).json({ error: 'Simulation failed' });
  }
});

// GET /api/mmm/scenarios — List saved scenarios
router.get('/scenarios', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await pool.query(
      'SELECT * FROM budget_scenarios WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching scenarios:', err);
    res.status(500).json({ error: 'Failed to fetch scenarios' });
  }
});

// POST /api/mmm/scenarios — Save a scenario
router.post('/scenarios', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { name, total_budget, allocations, predicted_total_revenue, predicted_roas, is_optimal } = req.body;
    if (!name || !total_budget) return res.status(400).json({ error: 'name and total_budget are required' });

    const result = await pool.query(`
      INSERT INTO budget_scenarios (user_id, name, total_budget, allocations, predicted_total_revenue, predicted_roas, is_optimal)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [userId, name, total_budget, JSON.stringify(allocations || []), predicted_total_revenue || 0, predicted_roas || 0, is_optimal || false]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving scenario:', err);
    res.status(500).json({ error: 'Failed to save scenario' });
  }
});

export default router;
