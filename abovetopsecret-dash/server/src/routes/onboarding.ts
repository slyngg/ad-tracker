import { Router, Request, Response } from 'express';
import pool from '../db';
import { checkAllSetupStatus, checkWebhookStatus, checkFacebookStatus } from '../services/setup-checker';
import { seedDemoData, clearDemoData } from '../services/demo-data';

const STEPS = ['welcome', 'connect_store', 'connect_ads', 'set_costs', 'configure_tracking', 'complete'];

const router = Router();

router.get('/progress', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) { res.json({ steps: STEPS.map(s => ({ step: s, completed: false, skipped: false, data: {} })), onboardingCompleted: false }); return; }

    const result = await pool.query('SELECT step, completed, skipped, data, completed_at FROM onboarding_progress WHERE user_id = $1 ORDER BY created_at', [userId]);
    const userResult = await pool.query('SELECT onboarding_completed, demo_mode, display_name FROM users WHERE id = $1', [userId]);

    const existing = new Map(result.rows.map(r => [r.step, r]));
    const steps = STEPS.map(step => {
      const row = existing.get(step);
      return { step, completed: row?.completed || false, skipped: row?.skipped || false, data: row?.data || {}, completedAt: row?.completed_at || null };
    });

    res.json({
      steps,
      onboardingCompleted: userResult.rows[0]?.onboarding_completed || false,
      demoMode: userResult.rows[0]?.demo_mode || false,
      displayName: userResult.rows[0]?.display_name || null,
    });
  } catch (err) {
    console.error('Error fetching onboarding progress:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/step', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { step, completed, skipped, data } = req.body;
    if (!step || !STEPS.includes(step)) return res.status(400).json({ error: 'Invalid step' });

    await pool.query(`
      INSERT INTO onboarding_progress (user_id, step, completed, skipped, data, completed_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (user_id, step) DO UPDATE SET completed = EXCLUDED.completed, skipped = EXCLUDED.skipped, data = COALESCE(EXCLUDED.data, onboarding_progress.data), completed_at = CASE WHEN EXCLUDED.completed THEN COALESCE(onboarding_progress.completed_at, NOW()) ELSE onboarding_progress.completed_at END, updated_at = NOW()
    `, [userId, step, completed || false, skipped || false, JSON.stringify(data || {}), completed ? new Date() : null]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error saving step:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? null;
    const statuses = await checkAllSetupStatus(userId);
    res.json(statuses);
  } catch (err) {
    console.error('Error fetching status:', err);
    res.status(500).json({ error: 'Failed to fetch' });
  }
});

router.post('/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    await pool.query(`INSERT INTO onboarding_progress (user_id, step, completed, completed_at, updated_at) VALUES ($1, 'complete', true, NOW(), NOW()) ON CONFLICT (user_id, step) DO UPDATE SET completed = true, completed_at = NOW(), updated_at = NOW()`, [userId]);
    await pool.query('UPDATE users SET onboarding_completed = true WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error completing onboarding:', err);
    res.status(500).json({ error: 'Failed to complete' });
  }
});

router.post('/reset', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    await pool.query('DELETE FROM onboarding_progress WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM setup_status WHERE user_id = $1', [userId]);
    await pool.query('UPDATE users SET onboarding_completed = false, demo_mode = false WHERE id = $1', [userId]);
    await clearDemoData(userId);
    res.json({ success: true });
  } catch (err) {
    console.error('Error resetting onboarding:', err);
    res.status(500).json({ error: 'Failed to reset' });
  }
});

router.post('/demo-mode', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Auth required' });
    const { enabled } = req.body;
    if (enabled) {
      const result = await seedDemoData(userId);
      res.json({ success: true, demoMode: true, ...result });
    } else {
      await clearDemoData(userId);
      res.json({ success: true, demoMode: false });
    }
  } catch (err) {
    console.error('Error toggling demo mode:', err);
    res.status(500).json({ error: 'Failed to toggle' });
  }
});

router.get('/check-webhooks', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? null;
    const { shopify, checkoutChamp } = await checkWebhookStatus(userId);
    res.json({
      shopify: shopify.status === 'connected',
      checkoutChamp: checkoutChamp.status === 'connected',
      shopifyCount: shopify.metadata.orderCount || 0,
      checkoutChampCount: checkoutChamp.metadata.orderCount || 0,
    });
  } catch (err) {
    res.json({ shopify: false, checkoutChamp: false, shopifyCount: 0, checkoutChampCount: 0 });
  }
});

router.get('/check-facebook', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id ?? null;
    const status = await checkFacebookStatus(userId);
    res.json({
      hasToken: status.metadata.hasToken || false,
      connected: status.status === 'connected',
      adRowCount: status.metadata.adRowCount || 0,
    });
  } catch (err) {
    res.json({ hasToken: false, connected: false, adRowCount: 0 });
  }
});

export default router;
