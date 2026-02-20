import { Router, Request, Response } from 'express';
import pool from '../db';

const SUPPORTED_PLATFORMS = ['google_ads', 'klaviyo', 'google_search_console', 'tiktok_ads', 'ga4'];

const router = Router();

router.get('/configs', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query('SELECT * FROM integration_configs WHERE user_id = $1', [userId]);

    // Return all platforms with status
    const configs = SUPPORTED_PLATFORMS.map(platform => {
      const existing = result.rows.find(r => r.platform === platform);
      return existing || { platform, status: 'disconnected', user_id: userId };
    });
    res.json(configs);
  } catch (err) {
    console.error('Error fetching integrations:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/connect', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { platform, credentials, config } = req.body;
    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    const result = await pool.query(`
      INSERT INTO integration_configs (user_id, platform, credentials, config, status)
      VALUES ($1, $2, $3, $4, 'connected')
      ON CONFLICT (user_id, platform) DO UPDATE SET credentials = EXCLUDED.credentials, config = EXCLUDED.config, status = 'connected', updated_at = NOW()
      RETURNING *
    `, [userId, platform, JSON.stringify(credentials || {}), JSON.stringify(config || {})]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error connecting integration:', err);
    res.status(500).json({ error: 'Failed to connect' });
  }
});

router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { platform } = req.body;
    await pool.query("UPDATE integration_configs SET status = 'disconnected', updated_at = NOW() WHERE user_id = $1 AND platform = $2", [userId, platform]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error disconnecting:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

router.post('/test', async (req: Request, res: Response) => {
  try {
    const { platform } = req.body;
    // Stub: real implementations will test actual connections
    res.json({ success: false, error: `${platform} integration coming soon` });
  } catch (err) {
    res.status(500).json({ error: 'Test failed' });
  }
});

export default router;
