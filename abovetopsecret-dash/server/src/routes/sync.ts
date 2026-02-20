import { Router, Request, Response } from 'express';
import { syncFacebook } from '../services/facebook-sync';

const router = Router();

// POST /api/sync/facebook
router.post('/facebook', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const result = await syncFacebook(userId);
    res.json(result);
  } catch (err) {
    console.error('Error triggering Meta Ads sync:', err);
    res.status(500).json({ error: 'Failed to sync Meta Ads data' });
  }
});

export default router;
