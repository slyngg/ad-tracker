import { Router, Request, Response } from 'express';
import { syncFacebook, backfillFacebook } from '../services/facebook-sync';
import { syncAllCCData } from '../services/cc-sync';
import { syncShopifyProducts, syncShopifyCustomers } from '../services/shopify-sync';
import { syncTikTokAds, backfillTikTok } from '../services/tiktok-sync';
import { syncAllKlaviyoData } from '../services/klaviyo-sync';
import { syncGA4Data } from '../services/ga4-sync';
import { syncAllNewsBreakForUser, backfillAllNewsBreakForUser } from '../services/newsbreak-sync';

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

// POST /api/sync/ga4
router.post('/ga4', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const result = await syncGA4Data(userId);
    res.json(result);
  } catch (err) {
    console.error('Error triggering GA4 sync:', err);
    res.status(500).json({ error: 'Failed to sync GA4 data' });
  }
});

// POST /api/sync/checkout-champ
router.post('/checkout-champ', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const result = await syncAllCCData(userId);
    res.json(result);
  } catch (err) {
    console.error('Error triggering CheckoutChamp sync:', err);
    res.status(500).json({ error: 'Failed to sync CheckoutChamp data' });
  }
});

// POST /api/sync/shopify
router.post('/shopify', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const products = await syncShopifyProducts(userId);
    const customers = await syncShopifyCustomers(userId);
    res.json({ products: products.synced, customers: customers.synced });
  } catch (err) {
    console.error('Error triggering Shopify sync:', err);
    res.status(500).json({ error: 'Failed to sync Shopify data' });
  }
});

// POST /api/sync/tiktok
router.post('/tiktok', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const result = await syncTikTokAds(userId);
    res.json(result);
  } catch (err) {
    console.error('Error triggering TikTok sync:', err);
    res.status(500).json({ error: 'Failed to sync TikTok data' });
  }
});

// POST /api/sync/newsbreak
router.post('/newsbreak', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const result = await syncAllNewsBreakForUser(userId);
    res.json(result);
  } catch (err) {
    console.error('Error triggering NewsBreak sync:', err);
    res.status(500).json({ error: 'Failed to sync NewsBreak data' });
  }
});

// POST /api/sync/newsbreak/backfill
router.post('/newsbreak/backfill', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    if (!userId) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 90, 1), 90);
    const result = await backfillAllNewsBreakForUser(userId, days);
    res.json(result);
  } catch (err) {
    console.error('Error triggering NewsBreak backfill:', err);
    res.status(500).json({ error: 'Failed to backfill NewsBreak data' });
  }
});

// POST /api/sync/facebook/backfill?days=90
router.post('/facebook/backfill', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 90, 1), 365);
    const result = await backfillFacebook(userId, days);
    res.json(result);
  } catch (err) {
    console.error('Error triggering Meta backfill:', err);
    res.status(500).json({ error: 'Failed to backfill Meta Ads data' });
  }
});

// POST /api/sync/tiktok/backfill?days=90
router.post('/tiktok/backfill', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 90, 1), 365);
    const result = await backfillTikTok(userId, days);
    res.json(result);
  } catch (err) {
    console.error('Error triggering TikTok backfill:', err);
    res.status(500).json({ error: 'Failed to backfill TikTok data' });
  }
});

// POST /api/sync/klaviyo
router.post('/klaviyo', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const result = await syncAllKlaviyoData(userId);
    res.json(result);
  } catch (err) {
    console.error('Error triggering Klaviyo sync:', err);
    res.status(500).json({ error: 'Failed to sync Klaviyo data' });
  }
});

export default router;
