import { Router, Request, Response } from 'express';
import {
  computeAttribution,
  getAttributionReport,
  compareModels,
  getJourneyAnalysis,
  getConversionPaths,
  getUserAttributionSettings,
  upsertUserAttributionSettings,
  verifyAttribution,
  getVerificationStatus,
  ALL_MODELS,
  VALID_LOOKBACK_DAYS,
  VALID_ACCOUNTING_MODES,
  type AttributionModel,
  type AccountingMode,
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

    const { start_date, end_date, models, lookback_days } = req.body as {
      start_date?: string;
      end_date?: string;
      models?: string[];
      lookback_days?: number;
    };

    // Validate models if provided
    const validModels: AttributionModel[] | undefined = models
      ? models.filter(isValidModel)
      : undefined;

    if (models && validModels && validModels.length === 0) {
      res.status(400).json({ error: `Invalid models. Must be from: ${ALL_MODELS.join(', ')}` });
      return;
    }

    // Resolve lookback days: explicit param > user setting > default 30
    let lookbackDays = 30;
    if (lookback_days !== undefined) {
      if (!VALID_LOOKBACK_DAYS.includes(lookback_days)) {
        res.status(400).json({ error: `Invalid lookback_days. Must be one of: ${VALID_LOOKBACK_DAYS.join(', ')}` });
        return;
      }
      lookbackDays = lookback_days;
    } else {
      const settings = await getUserAttributionSettings(userId);
      lookbackDays = settings.default_lookback_days;
    }

    const options: ComputeOptions = { lookbackDays };
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

/**
 * GET /api/pixel-attribution/settings
 * Get user's attribution settings.
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const settings = await getUserAttributionSettings(userId);
    res.json(settings);
  } catch (err) {
    console.error('Error fetching attribution settings:', err);
    res.status(500).json({ error: 'Failed to fetch attribution settings' });
  }
});

/**
 * PUT /api/pixel-attribution/settings
 * Update user's attribution settings.
 * Body: { default_lookback_days?, default_model?, accounting_mode? }
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { default_lookback_days, default_model, accounting_mode } = req.body as {
      default_lookback_days?: number;
      default_model?: string;
      accounting_mode?: string;
    };

    // Validate lookback_days
    if (default_lookback_days !== undefined && !VALID_LOOKBACK_DAYS.includes(default_lookback_days)) {
      res.status(400).json({
        error: `Invalid default_lookback_days. Must be one of: ${VALID_LOOKBACK_DAYS.join(', ')}`,
      });
      return;
    }

    // Validate model
    if (default_model !== undefined && !isValidModel(default_model)) {
      res.status(400).json({
        error: `Invalid default_model. Must be one of: ${ALL_MODELS.join(', ')}`,
      });
      return;
    }

    // Validate accounting_mode
    if (accounting_mode !== undefined && !(VALID_ACCOUNTING_MODES as readonly string[]).includes(accounting_mode)) {
      res.status(400).json({
        error: `Invalid accounting_mode. Must be one of: ${VALID_ACCOUNTING_MODES.join(', ')}`,
      });
      return;
    }

    const settings = await upsertUserAttributionSettings(userId, {
      default_lookback_days,
      default_model: default_model as AttributionModel | undefined,
      accounting_mode: accounting_mode as AccountingMode | undefined,
    });

    res.json(settings);
  } catch (err) {
    console.error('Error updating attribution settings:', err);
    res.status(500).json({ error: 'Failed to update attribution settings' });
  }
});

/**
 * GET /api/pixel-attribution/compare-windows
 * Compare attribution results across different lookback windows.
 * Query params: start_date, end_date, model (default: time_decay), group_by (default: platform)
 * Returns data for windows: 7d, 14d, 30d, 60d, 90d
 */
router.get('/compare-windows', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    const model = (req.query.model as string) || 'time_decay';
    const groupBy = (req.query.group_by as string) || 'platform';

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
      return;
    }
    if (!isValidModel(model)) {
      res.status(400).json({ error: `Invalid model. Must be one of: ${ALL_MODELS.join(', ')}` });
      return;
    }
    if (!isValidGroupBy(groupBy)) {
      res.status(400).json({ error: 'group_by must be one of: platform, campaign, source, channel' });
      return;
    }

    // Compute attribution for each window and return side by side
    const windows = [7, 14, 30, 60, 90];
    const windowResults: Record<string, unknown> = {};

    for (const lookbackDays of windows) {
      // First compute for this window (in case it hasn't been computed yet)
      await computeAttribution(userId, {
        startDate,
        endDate,
        models: [model as AttributionModel],
        lookbackDays,
      });

      // Then fetch the report
      const report = await getAttributionReport(userId, {
        model: model as AttributionModel,
        startDate,
        endDate,
        groupBy: groupBy as 'platform' | 'campaign' | 'source' | 'channel',
      });

      windowResults[`${lookbackDays}d`] = report;
    }

    res.json({
      model,
      group_by: groupBy,
      start_date: startDate,
      end_date: endDate,
      windows: windowResults,
    });
  } catch (err) {
    console.error('Error comparing attribution windows:', err);
    res.status(500).json({ error: 'Failed to compare attribution windows' });
  }
});

/**
 * GET /api/pixel-attribution/verification
 * Returns the latest verification status for the authenticated user.
 */
router.get('/verification', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const status = await getVerificationStatus(userId);
    res.json(status);
  } catch (err) {
    console.error('Error fetching verification status:', err);
    res.status(500).json({ error: 'Failed to fetch verification status' });
  }
});

/**
 * POST /api/pixel-attribution/verify
 * Trigger a manual verification of all attribution results for the user.
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const report = await verifyAttribution(userId);
    const status = await getVerificationStatus(userId);

    res.json({
      ...status,
      report: {
        ordersChecked: report.ordersChecked,
        ordersFixed: report.ordersFixed,
        allValid: report.allValid,
      },
    });
  } catch (err) {
    console.error('Error running attribution verification:', err);
    res.status(500).json({ error: 'Failed to run attribution verification' });
  }
});

export default router;
