/**
 * CAPI Relay Routes — Meta Conversions API configuration & monitoring
 *
 * Authenticated dashboard routes for managing Meta CAPI relay configs,
 * viewing relay stats, and sending test events.
 */

import { Router, Request, Response } from 'express';
import pool from '../db';
import { encrypt } from '../services/oauth-providers';
import { sendTestEvent, getRelayStats } from '../services/meta-capi';

const router = Router();

// ── GET /configs — List CAPI configs for the authenticated user ──

router.get('/configs', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await pool.query(
      `SELECT id, user_id, pixel_id, use_integration_token, enabled, event_filter, test_event_code, created_at, updated_at
       FROM capi_relay_configs
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[CAPI Relay] Error fetching configs:', err);
    res.status(500).json({ error: 'Failed to fetch configs' });
  }
});

// ── POST /configs — Create or update a CAPI config ───────────────

router.post('/configs', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const {
      pixel_id,
      enabled = true,
      event_filter = [],
      test_event_code = null,
      access_token = null,
      use_integration_token = true,
    } = req.body;

    if (!pixel_id || typeof pixel_id !== 'string') {
      res.status(400).json({ error: 'pixel_id is required' });
      return;
    }

    // Encrypt standalone access token if provided
    let encryptedToken: string | null = null;
    if (access_token && typeof access_token === 'string') {
      encryptedToken = encrypt(access_token);
    }

    const result = await pool.query(
      `INSERT INTO capi_relay_configs (user_id, pixel_id, enabled, event_filter, test_event_code, access_token_encrypted, use_integration_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, pixel_id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         event_filter = EXCLUDED.event_filter,
         test_event_code = EXCLUDED.test_event_code,
         access_token_encrypted = CASE WHEN EXCLUDED.access_token_encrypted IS NOT NULL THEN EXCLUDED.access_token_encrypted ELSE capi_relay_configs.access_token_encrypted END,
         use_integration_token = EXCLUDED.use_integration_token,
         updated_at = NOW()
       RETURNING id, user_id, pixel_id, use_integration_token, enabled, event_filter, test_event_code, created_at, updated_at`,
      [
        userId,
        pixel_id.trim(),
        enabled,
        JSON.stringify(Array.isArray(event_filter) ? event_filter : []),
        test_event_code || null,
        encryptedToken,
        use_integration_token,
      ],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[CAPI Relay] Error saving config:', err);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// ── DELETE /configs/:id — Delete a CAPI config ───────────────────

router.delete('/configs/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const configId = parseInt(req.params.id, 10);
    if (isNaN(configId)) {
      res.status(400).json({ error: 'Invalid config ID' });
      return;
    }

    const result = await pool.query(
      `DELETE FROM capi_relay_configs WHERE id = $1 AND user_id = $2 RETURNING id`,
      [configId, userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }

    res.json({ success: true, deleted_id: configId });
  } catch (err) {
    console.error('[CAPI Relay] Error deleting config:', err);
    res.status(500).json({ error: 'Failed to delete config' });
  }
});

// ── GET /stats — Relay statistics for the authenticated user ─────

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const stats = await getRelayStats(userId);
    res.json(stats);
  } catch (err) {
    console.error('[CAPI Relay] Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── POST /test — Send a test event to verify config ──────────────

router.post('/test', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { config_id } = req.body;
    if (!config_id) {
      res.status(400).json({ error: 'config_id is required' });
      return;
    }

    const result = await sendTestEvent(config_id, userId);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    console.error('[CAPI Relay] Error sending test event:', err);
    res.status(500).json({ error: 'Failed to send test event' });
  }
});

export default router;
