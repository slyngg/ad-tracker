import { Router, Request, Response } from 'express';
import {
  getNewVsReturningMetrics,
  getNewVsReturningTimeseries,
  getNewVsReturningByPlatform,
} from '../services/new-vs-returning';
import { ALL_MODELS, type AttributionModel } from '../services/pixel-attribution';

const router = Router();

function isValidModel(model: string): model is AttributionModel {
  return ALL_MODELS.includes(model as AttributionModel);
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const model = (req.query.model as string) || 'last_click';
    const startDate = req.query.start as string;
    const endDate = req.query.end as string;

    if (!isValidModel(model)) {
      res.status(400).json({ error: `Invalid model. Must be one of: ${ALL_MODELS.join(', ')}` });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
      return;
    }

    const data = await getNewVsReturningMetrics(userId, startDate, endDate, model);
    res.json({ model, start: startDate, end: endDate, ...data });
  } catch (err) {
    console.error('Error fetching new vs returning metrics:', err);
    res.status(500).json({ error: 'Failed to fetch new vs returning metrics' });
  }
});

router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const model = (req.query.model as string) || 'last_click';
    const startDate = req.query.start as string;
    const endDate = req.query.end as string;
    const granularity = (req.query.granularity as string) || 'day';

    if (!isValidModel(model)) {
      res.status(400).json({ error: `Invalid model. Must be one of: ${ALL_MODELS.join(', ')}` });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
      return;
    }
    if (!['day', 'week'].includes(granularity)) {
      res.status(400).json({ error: 'granularity must be day or week' });
      return;
    }

    const data = await getNewVsReturningTimeseries(
      userId,
      startDate,
      endDate,
      model,
      granularity as 'day' | 'week',
    );
    res.json({ model, start: startDate, end: endDate, granularity, data });
  } catch (err) {
    console.error('Error fetching new vs returning timeseries:', err);
    res.status(500).json({ error: 'Failed to fetch new vs returning timeseries' });
  }
});

router.get('/by-platform', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const model = (req.query.model as string) || 'last_click';
    const startDate = req.query.start as string;
    const endDate = req.query.end as string;

    if (!isValidModel(model)) {
      res.status(400).json({ error: `Invalid model. Must be one of: ${ALL_MODELS.join(', ')}` });
      return;
    }
    if (!startDate || !endDate) {
      res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' });
      return;
    }

    const data = await getNewVsReturningByPlatform(userId, startDate, endDate, model);
    res.json({ model, start: startDate, end: endDate, data });
  } catch (err) {
    console.error('Error fetching new vs returning by platform:', err);
    res.status(500).json({ error: 'Failed to fetch new vs returning by platform' });
  }
});

export default router;
