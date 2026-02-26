import { Router, Request, Response } from 'express';
import {
  getBenchmarks,
  updateBenchmark,
  computeBenchmarks,
  computeCampaignStoplights,
  getStoplights,
  getStoplightSummary,
  getDailySnapshots,
  ALL_METRICS,
  type BenchmarkMetric,
  type Signal,
} from '../services/benchmarks';

const router = Router();

/**
 * GET /api/benchmarks
 * Returns all benchmark thresholds for the authenticated user.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const benchmarks = await getBenchmarks(userId);
    res.json({ benchmarks });
  } catch (err) {
    console.error('Error fetching benchmarks:', err);
    res.status(500).json({ error: 'Failed to fetch benchmarks' });
  }
});

/**
 * PUT /api/benchmarks/:metric
 * Manually set green/amber thresholds for a specific metric.
 * Body: { threshold_green: number, threshold_amber: number }
 */
router.put('/:metric', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const metric = req.params.metric as string;
    if (!ALL_METRICS.includes(metric as BenchmarkMetric)) {
      res.status(400).json({ error: `Invalid metric. Must be one of: ${ALL_METRICS.join(', ')}` });
      return;
    }

    const { threshold_green, threshold_amber } = req.body as {
      threshold_green?: number;
      threshold_amber?: number;
    };

    if (threshold_green == null || threshold_amber == null) {
      res.status(400).json({ error: 'threshold_green and threshold_amber are required' });
      return;
    }

    const benchmark = await updateBenchmark(
      userId,
      metric as BenchmarkMetric,
      threshold_green,
      threshold_amber,
    );

    res.json({ benchmark });
  } catch (err) {
    console.error('Error updating benchmark:', err);
    res.status(500).json({ error: 'Failed to update benchmark' });
  }
});

/**
 * POST /api/benchmarks/compute
 * Force recompute benchmarks + campaign stoplights.
 */
router.post('/compute', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    await computeBenchmarks(userId);
    await computeCampaignStoplights(userId);

    const benchmarks = await getBenchmarks(userId);
    const summary = await getStoplightSummary(userId);

    res.json({ success: true, benchmarks, summary });
  } catch (err) {
    console.error('Error computing benchmarks:', err);
    res.status(500).json({ error: 'Failed to compute benchmarks' });
  }
});

/**
 * GET /api/benchmarks/stoplights
 * Returns all campaign stoplights. Optional query: platform, signal
 */
router.get('/stoplights', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const platform = req.query.platform as string | undefined;
    const signal = req.query.signal as string | undefined;

    const validSignals = ['scale', 'watch', 'cut'];
    if (signal && !validSignals.includes(signal)) {
      res.status(400).json({ error: `Invalid signal. Must be one of: ${validSignals.join(', ')}` });
      return;
    }

    const stoplights = await getStoplights(userId, {
      platform,
      signal: signal as Signal | undefined,
    });

    res.json({ stoplights });
  } catch (err) {
    console.error('Error fetching stoplights:', err);
    res.status(500).json({ error: 'Failed to fetch stoplights' });
  }
});

/**
 * GET /api/benchmarks/stoplights/summary
 * Returns scale/watch/cut counts.
 */
router.get('/stoplights/summary', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const summary = await getStoplightSummary(userId);
    res.json({ summary });
  } catch (err) {
    console.error('Error fetching stoplight summary:', err);
    res.status(500).json({ error: 'Failed to fetch stoplight summary' });
  }
});

/**
 * GET /api/benchmarks/daily-snapshots
 * Returns daily profit snapshots. Optional query: start, end
 */
router.get('/daily-snapshots', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const start = req.query.start as string | undefined;
    const end = req.query.end as string | undefined;

    const snapshots = await getDailySnapshots(userId, start, end);
    res.json({ snapshots });
  } catch (err) {
    console.error('Error fetching daily snapshots:', err);
    res.status(500).json({ error: 'Failed to fetch daily snapshots' });
  }
});

export default router;
