import { Router, Request, Response } from 'express';
import { getCorrelationData, getAvailableMetrics } from '../services/metrics-correlation';

const router = Router();

// GET /api/metrics/correlation/available — list available metrics
router.get('/correlation/available', (_req: Request, res: Response) => {
  try {
    res.json(getAvailableMetrics());
  } catch (err) {
    console.error('Error fetching available metrics:', err);
    res.status(500).json({ error: 'Failed to fetch available metrics' });
  }
});

// GET /api/metrics/correlation?x=meta_spend&y=total_revenue&start=2026-01-01&end=2026-02-26&granularity=day
router.get('/correlation', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const metricX = req.query.x as string;
    const metricY = req.query.y as string;
    const startDate = req.query.start as string;
    const endDate = req.query.end as string;
    const granularity = (req.query.granularity as 'day' | 'week') || 'day';

    if (!metricX || !metricY) {
      res.status(400).json({ error: 'Both x and y metric parameters are required' });
      return;
    }

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'Both start and end date parameters are required (YYYY-MM-DD)' });
      return;
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      res.status(400).json({ error: 'Dates must be in YYYY-MM-DD format' });
      return;
    }

    const available = getAvailableMetrics().map((m) => m.key);
    if (!available.includes(metricX)) {
      res.status(400).json({ error: `Invalid x metric: ${metricX}. Must be one of: ${available.join(', ')}` });
      return;
    }
    if (!available.includes(metricY)) {
      res.status(400).json({ error: `Invalid y metric: ${metricY}. Must be one of: ${available.join(', ')}` });
      return;
    }

    const data = await getCorrelationData(userId, metricX, metricY, startDate, endDate, granularity);
    res.json(data);
  } catch (err) {
    console.error('Error fetching correlation data:', err);
    res.status(500).json({ error: 'Failed to fetch correlation data' });
  }
});

export default router;
