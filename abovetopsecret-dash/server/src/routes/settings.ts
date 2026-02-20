import { Router, Request, Response } from 'express';
import https from 'https';
import { getAllSettings, setSetting, deleteSetting, getSetting } from '../services/settings';

const router = Router();

// GET /api/settings — return all settings (sensitive values masked)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const settings = await getAllSettings(userId);
    res.json(settings);
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /api/settings — bulk update settings
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'string' && value.trim()) {
        await setSetting(key, value.trim(), 'admin', userId);
      }
    }
    const settings = await getAllSettings(userId);
    res.json(settings);
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// DELETE /api/settings/:key — remove a setting (reverts to env var fallback)
router.delete('/:key', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    await deleteSetting(req.params.key, userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting setting:', err);
    res.status(500).json({ error: 'Failed to delete setting' });
  }
});

// POST /api/settings/test/facebook — test FB connection
router.post('/test/facebook', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const token = await getSetting('fb_access_token', userId);
    const accountIds = await getSetting('fb_ad_account_ids', userId);

    if (!token) {
      res.json({ success: false, error: 'No Facebook access token configured' });
      return;
    }

    // Test by fetching account info
    const firstAccount = (accountIds || '').split(',')[0]?.trim();
    if (!firstAccount) {
      res.json({ success: false, error: 'No ad account IDs configured' });
      return;
    }

    const url = `https://graph.facebook.com/v19.0/${firstAccount}?fields=name,account_status&access_token=${token}`;

    const result = await new Promise<{ name?: string; error?: { message: string } }>((resolve, reject) => {
      https.get(url, (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
        response.on('error', reject);
      }).on('error', reject);
    });

    if (result.error) {
      res.json({ success: false, error: result.error.message });
    } else {
      res.json({ success: true, account_name: result.name, account_id: firstAccount });
    }
  } catch (err) {
    console.error('Error testing FB connection:', err);
    res.json({ success: false, error: 'Connection failed' });
  }
});

// POST /api/settings/test/checkout-champ — test CC API connection
router.post('/test/checkout-champ', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const apiKey = await getSetting('cc_api_key', userId);
    const apiUrl = await getSetting('cc_api_url', userId);

    if (!apiKey || !apiUrl) {
      res.json({ success: false, error: 'CC API key or URL not configured' });
      return;
    }

    const url = `${apiUrl.replace(/\/$/, '')}/orders?limit=1`;
    const parsedUrl = new URL(url);

    const result = await new Promise<{ data?: unknown[]; message?: string; error?: string }>((resolve, reject) => {
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
      };

      const req = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
        response.on('error', reject);
      });

      req.on('error', reject);
      req.end();
    });

    if (result.error) {
      res.json({ success: false, error: result.error });
    } else {
      res.json({ success: true, message: 'Connected to CheckoutChamp API' });
    }
  } catch (err) {
    console.error('Error testing CC connection:', err);
    res.json({ success: false, error: 'Connection failed' });
  }
});

export default router;
