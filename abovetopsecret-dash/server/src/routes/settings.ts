import { Router, Request, Response } from 'express';
import https from 'https';
import { getAllSettings, setSetting, deleteSetting, getSetting } from '../services/settings';
import { CheckoutChampClient } from '../services/checkout-champ-client';

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

// Settings that should never be writable via the API
const PROTECTED_SETTINGS = ['auth_token', 'jwt_secret'];

// POST /api/settings — bulk update settings
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      if (PROTECTED_SETTINGS.includes(key)) {
        res.status(403).json({ error: `Setting '${key}' cannot be modified via API` });
        return;
      }
      if (typeof value === 'string' && value.trim()) {
        await setSetting(key, value.trim(), 'admin', userId);
      } else if (typeof value === 'string' && !value.trim()) {
        // Empty string means delete the setting
        await deleteSetting(key, userId);
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

// POST /api/settings/test/facebook — test Meta Ads connection
router.post('/test/facebook', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const token = await getSetting('fb_access_token', userId);
    const accountIds = await getSetting('fb_ad_account_ids', userId);

    if (!token) {
      res.json({ success: false, error: 'No Meta access token configured' });
      return;
    }

    // Test by fetching account info
    const firstAccount = (accountIds || '').split(',')[0]?.trim();
    if (!firstAccount) {
      res.json({ success: false, error: 'No ad account IDs configured' });
      return;
    }

    const url = `https://graph.facebook.com/v21.0/${firstAccount}?fields=name,account_status&access_token=${token}`;

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
    console.error('Error testing Meta Ads connection:', err);
    res.json({ success: false, error: 'Connection failed' });
  }
});

// POST /api/settings/test/checkout-champ — test CC API connection
router.post('/test/checkout-champ', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const client = await CheckoutChampClient.fromSettings(userId);

    if (!client) {
      res.json({ success: false, error: 'CC Login ID or Password not configured' });
      return;
    }

    const result = await client.testConnection();
    if (result.success) {
      res.json({ success: true, message: 'Connected to CheckoutChamp API' });
    } else {
      res.json({ success: false, error: result.error || 'Authentication failed' });
    }
  } catch (err) {
    console.error('Error testing CC connection:', err);
    res.json({ success: false, error: 'Connection failed' });
  }
});

// POST /api/settings/test/newsbreak — test NewsBreak API connection
router.post('/test/newsbreak', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const apiKey = await getSetting('newsbreak_api_key', userId);

    if (!apiKey) {
      res.json({ success: false, error: 'No NewsBreak API key configured' });
      return;
    }

    // Test with a minimal DATE report — use yesterday+today to handle API reporting lag
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const postData = JSON.stringify({
      name: 'connection_test',
      dateRange: 'FIXED',
      startDate: yesterday,
      endDate: today,
      dimensions: ['DATE'],
      metrics: ['COST'],
    });

    const result = await new Promise<any>((resolve, reject) => {
      const options = {
        hostname: 'business.newsbreak.com',
        path: '/business-api/v1/reports/getIntegratedReport',
        method: 'POST',
        headers: {
          'Access-Token': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Accept': 'application/json',
        },
      };

      const request = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => (data += chunk));
        response.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
        response.on('error', reject);
      });
      request.setTimeout(15_000, () => request.destroy(new Error('Request timeout')));
      request.on('error', reject);
      request.write(postData);
      request.end();
    });

    if (result.code === 0) {
      const spend = ((result.data?.aggregateData?.[0]?.costDecimal || 0) / 100).toFixed(2);
      res.json({ success: true, message: `Connected to NewsBreak API — recent spend: $${spend}` });
    } else {
      res.json({ success: false, error: result.errMsg || 'API returned an error' });
    }
  } catch (err) {
    console.error('Error testing NewsBreak connection:', err);
    res.json({ success: false, error: 'Connection failed' });
  }
});

export default router;
