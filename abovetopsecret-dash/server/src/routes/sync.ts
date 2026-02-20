import { Router, Request, Response } from 'express';
import { syncFacebook } from '../services/facebook-sync';

const router = Router();

// POST /api/sync/facebook
router.post('/facebook', async (_req: Request, res: Response) => {
  try {
    const result = await syncFacebook();
    res.json(result);
  } catch (err) {
    console.error('Error triggering FB sync:', err);
    res.status(500).json({ error: 'Failed to sync Facebook data' });
  }
});

export default router;
