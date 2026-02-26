import { Router, Request, Response } from 'express';
import pool from '../db';
import {
  computeViewThrough,
  getViewThroughReport,
  getCombinedAttribution,
} from '../services/view-through-attribution';
import { ALL_MODELS, type AttributionModel } from '../services/pixel-attribution';

const router = Router();

// Validate model parameter
function isValidModel(model: string): model is AttributionModel {
  return ALL_MODELS.includes(model as AttributionModel);
}

/**
 * GET /api/attribution/view-through?start=&end=
 * View-through attribution report by platform.
 */
router.get('/view-through', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const startDate = req.query.start as string;
    const endDate = req.query.end as string;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
      return;
    }

    const data = await getViewThroughReport(userId, startDate, endDate);

    res.json({ start_date: startDate, end_date: endDate, ...data });
  } catch (err) {
    console.error('Error fetching view-through report:', err);
    res.status(500).json({ error: 'Failed to fetch view-through report' });
  }
});

/**
 * GET /api/attribution/combined?start=&end=&model=
 * Combined click + view-through attribution per platform.
 */
router.get('/combined', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const startDate = req.query.start as string;
    const endDate = req.query.end as string;
    const model = (req.query.model as string) || 'last_click';

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
      return;
    }

    if (!isValidModel(model)) {
      res.status(400).json({ error: `Invalid model. Must be one of: ${ALL_MODELS.join(', ')}` });
      return;
    }

    const data = await getCombinedAttribution(userId, startDate, endDate, model);

    res.json({ start_date: startDate, end_date: endDate, model, ...data });
  } catch (err) {
    console.error('Error fetching combined attribution:', err);
    res.status(500).json({ error: 'Failed to fetch combined attribution' });
  }
});

/**
 * POST /api/attribution/view-through/compute
 * Manually trigger view-through computation.
 * Body: { start_date?, end_date? }
 */
router.post('/view-through/compute', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { start_date, end_date } = req.body as {
      start_date?: string;
      end_date?: string;
    };

    const now = new Date();
    const startDate = start_date || new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const endDate = end_date || now.toISOString().slice(0, 10);

    const result = await computeViewThrough(userId, startDate, endDate);

    res.json({
      success: true,
      orders_processed: result.orders,
      view_through_results: result.results,
    });
  } catch (err) {
    console.error('Error computing view-through attribution:', err);
    res.status(500).json({ error: 'Failed to compute view-through attribution' });
  }
});

/**
 * GET /api/attribution/impressions?start=&end=&platform=
 * Raw impression data from pixel_impressions.
 */
router.get('/impressions', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const startDate = req.query.start as string;
    const endDate = req.query.end as string;
    const platform = req.query.platform as string | undefined;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
      return;
    }

    const params: unknown[] = [userId, startDate, endDate];
    let platformFilter = '';
    if (platform) {
      platformFilter = ' AND platform = $4';
      params.push(platform);
    }

    const { rows } = await pool.query(
      `SELECT
         platform,
         campaign_id,
         campaign_name,
         date,
         SUM(impressions) AS impressions,
         SUM(reach) AS reach,
         AVG(frequency) AS frequency
       FROM pixel_impressions
       WHERE user_id = $1
         AND date >= $2::date
         AND date <= $3::date
         ${platformFilter}
       GROUP BY platform, campaign_id, campaign_name, date
       ORDER BY date DESC, impressions DESC`,
      params,
    );

    res.json({
      start_date: startDate,
      end_date: endDate,
      platform: platform || 'all',
      data: rows.map((r) => ({
        platform: r.platform,
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        date: r.date,
        impressions: parseInt(r.impressions, 10) || 0,
        reach: parseInt(r.reach, 10) || 0,
        frequency: parseFloat(parseFloat(r.frequency || '0').toFixed(2)),
      })),
    });
  } catch (err) {
    console.error('Error fetching impression data:', err);
    res.status(500).json({ error: 'Failed to fetch impression data' });
  }
});

export default router;
