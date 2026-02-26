import { Router, Request, Response } from 'express';
import {
  computeAttribution,
  getAttributionReport,
  compareModels,
  getJourneyAnalysis,
  getConversionPaths,
  ALL_MODELS,
  type AttributionModel,
  type ComputeOptions,
} from '../services/pixel-attribution';

const router = Router();

// Validate model parameter
function isValidModel(model: string): model is AttributionModel {
  return ALL_MODELS.includes(model as AttributionModel);
}

// Validate group_by parameter
function isValidGroupBy(g: string): g is 'platform' | 'campaign' | 'source' | 'channel' {
  return ['platform', 'campaign', 'source', 'channel'].includes(g);
}

/**
 * GET /api/pixel-attribution/report
 * Query params: model, start_date, end_date, group_by
 */
router.get('/report', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const model = (req.query.model as string) || 'last_click';
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const groupBy = (req.query.group_by as string) || 'platform';

    if (!isValidModel(model)) {
      res.status(400).json({ error: `Invalid model. Must be one of: ${ALL_MODELS.join(', ')}` });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
      return;
    }
    if (!isValidGroupBy(groupBy)) {
      res.status(400).json({ error: 'group_by must be one of: platform, campaign, source, channel' });
      return;
    }

    const data = await getAttributionReport(userId, {
      model,
      startDate,
      endDate,
      groupBy,
    });

    res.json({ model, group_by: groupBy, start_date: startDate, end_date: endDate, data });
  } catch (err) {
    console.error('Error fetching attribution report:', err);
    res.status(500).json({ error: 'Failed to fetch attribution report' });
  }
});

/**
 * GET /api/pixel-attribution/compare
 * Compare all models side by side.
 * Query params: start_date, end_date, group_by
 */
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const groupBy = (req.query.group_by as string) || 'platform';

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
      return;
    }
    if (!isValidGroupBy(groupBy)) {
      res.status(400).json({ error: 'group_by must be one of: platform, campaign, source, channel' });
      return;
    }

    const data = await compareModels(userId, startDate, endDate, groupBy);

    res.json({ group_by: groupBy, start_date: startDate, end_date: endDate, models: data });
  } catch (err) {
    console.error('Error comparing attribution models:', err);
    res.status(500).json({ error: 'Failed to compare attribution models' });
  }
});

/**
 * GET /api/pixel-attribution/journey-analysis
 * Query params: start_date, end_date
 */
router.get('/journey-analysis', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
      return;
    }

    const data = await getJourneyAnalysis(userId, startDate, endDate);

    res.json({ start_date: startDate, end_date: endDate, ...data });
  } catch (err) {
    console.error('Error fetching journey analysis:', err);
    res.status(500).json({ error: 'Failed to fetch journey analysis' });
  }
});

/**
 * GET /api/pixel-attribution/paths
 * Top conversion paths.
 * Query params: start_date, end_date, limit (default 20)
 */
router.get('/paths', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
      return;
    }

    const data = await getConversionPaths(userId, startDate, endDate, limit);

    res.json({ start_date: startDate, end_date: endDate, paths: data });
  } catch (err) {
    console.error('Error fetching conversion paths:', err);
    res.status(500).json({ error: 'Failed to fetch conversion paths' });
  }
});

/**
 * POST /api/pixel-attribution/compute
 * Manually trigger attribution computation.
 * Body: { start_date?, end_date?, models? }
 */
router.post('/compute', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { start_date, end_date, models } = req.body as {
      start_date?: string;
      end_date?: string;
      models?: string[];
    };

    // Validate models if provided
    const validModels: AttributionModel[] | undefined = models
      ? models.filter(isValidModel)
      : undefined;

    if (models && validModels && validModels.length === 0) {
      res.status(400).json({ error: `Invalid models. Must be from: ${ALL_MODELS.join(', ')}` });
      return;
    }

    const options: ComputeOptions = {};
    if (start_date) options.startDate = start_date;
    if (end_date) options.endDate = end_date;
    if (validModels && validModels.length > 0) options.models = validModels;

    const result = await computeAttribution(userId, options);

    res.json({
      success: true,
      orders_processed: result.orders,
      attribution_results: result.results,
    });
  } catch (err) {
    console.error('Error computing attribution:', err);
    res.status(500).json({ error: 'Failed to compute attribution' });
  }
});

export default router;
