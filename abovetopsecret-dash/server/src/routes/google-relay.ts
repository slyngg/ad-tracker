/**
 * Google Relay Routes — GA4 Measurement Protocol configuration & monitoring
 *
 * Authenticated dashboard routes for managing Google Enhanced Conversions relay
 * configs, viewing relay stats, and sending test events.
 */

import { Router, Request, Response } from 'express';
import pool from '../db';
import { encrypt } from '../services/oauth-providers';
import {
  getRelayStats,
  sendTestEvent,
  processUnsentEventsForUser,
  EVENT_MAP,
  MAPPED_EVENTS,
} from '../services/google-enhanced-conversions';

const router = Router();

// ── GET /api/google-relay/configs — list user's relay configs ─

router.get('/configs', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await pool.query(
      `SELECT id, user_id, measurement_id, google_ads_customer_id, conversion_action_id,
              enabled, event_filter, created_at, updated_at
       FROM google_relay_configs
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId],
    );

    res.json({
      configs: result.rows,
      available_events: MAPPED_EVENTS,
      event_map: EVENT_MAP,
    });
  } catch (err) {
    console.error('[Google Relay] Error fetching configs:', err);
    res.status(500).json({ error: 'Failed to fetch Google relay configs' });
  }
});

// ── POST /api/google-relay/configs — create or update config ──

router.post('/configs', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const {
      id,
      measurement_id,
      api_secret,
      google_ads_customer_id = null,
      conversion_action_id = null,
      enabled = true,
      event_filter = [],
    } = req.body;

    if (!measurement_id || typeof measurement_id !== 'string') {
      res.status(400).json({ error: 'measurement_id is required (e.g. "G-XXXXXXX")' });
      return;
    }

    // Validate measurement_id format
    if (!/^G-[A-Z0-9]+$/i.test(measurement_id.trim())) {
      res.status(400).json({ error: 'measurement_id must be in format "G-XXXXXXX"' });
      return;
    }

    // Encrypt API secret if provided
    let encryptedSecret: string | null = null;
    if (api_secret && typeof api_secret === 'string') {
      encryptedSecret = encrypt(api_secret);
    }

    if (id) {
      // Update existing config
      const updateFields: string[] = [
        'measurement_id = $1',
        'google_ads_customer_id = $2',
        'conversion_action_id = $3',
        'enabled = $4',
        'event_filter = $5',
        'updated_at = NOW()',
      ];
      const params: any[] = [
        measurement_id.trim(),
        google_ads_customer_id || null,
        conversion_action_id || null,
        enabled !== false,
        JSON.stringify(Array.isArray(event_filter) ? event_filter : []),
      ];

      // Only update api_secret if a new one was provided
      if (encryptedSecret) {
        updateFields.push(`api_secret = $${params.length + 1}`);
        params.push(encryptedSecret);
      }

      params.push(id);
      params.push(userId);

      const result = await pool.query(
        `UPDATE google_relay_configs SET
           ${updateFields.join(', ')}
         WHERE id = $${params.length - 1} AND user_id = $${params.length}
         RETURNING id, user_id, measurement_id, google_ads_customer_id, conversion_action_id,
                   enabled, event_filter, created_at, updated_at`,
        params,
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Config not found' });
        return;
      }

      res.json(result.rows[0]);
      return;
    }

    // Create new config — api_secret is required for new configs
    if (!encryptedSecret) {
      res.status(400).json({ error: 'api_secret is required for new configs' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO google_relay_configs (user_id, measurement_id, api_secret, google_ads_customer_id, conversion_action_id, enabled, event_filter)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, measurement_id) DO UPDATE SET
         api_secret = COALESCE(EXCLUDED.api_secret, google_relay_configs.api_secret),
         google_ads_customer_id = EXCLUDED.google_ads_customer_id,
         conversion_action_id = EXCLUDED.conversion_action_id,
         enabled = EXCLUDED.enabled,
         event_filter = EXCLUDED.event_filter,
         updated_at = NOW()
       RETURNING id, user_id, measurement_id, google_ads_customer_id, conversion_action_id,
                 enabled, event_filter, created_at, updated_at`,
      [
        userId,
        measurement_id.trim(),
        encryptedSecret,
        google_ads_customer_id || null,
        conversion_action_id || null,
        enabled !== false,
        JSON.stringify(Array.isArray(event_filter) ? event_filter : []),
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Google Relay] Error saving config:', err);
    res.status(500).json({ error: 'Failed to save Google relay config' });
  }
});

// ── DELETE /api/google-relay/configs/:id — delete a config ────

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
      'DELETE FROM google_relay_configs WHERE id = $1 AND user_id = $2 RETURNING id',
      [configId, userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }

    res.json({ success: true, deleted_id: configId });
  } catch (err) {
    console.error('[Google Relay] Error deleting config:', err);
    res.status(500).json({ error: 'Failed to delete Google relay config' });
  }
});

// ── GET /api/google-relay/stats — relay statistics ────────────

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
    console.error('[Google Relay] Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch relay stats' });
  }
});

// ── POST /api/google-relay/test — send a test event ───────────

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
    res.json(result);
  } catch (err: any) {
    console.error('[Google Relay] Error sending test event:', err);
    res.status(500).json({ error: err.message || 'Failed to send test event' });
  }
});

// ── POST /api/google-relay/process — manually trigger relay ───

router.post('/process', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await processUnsentEventsForUser(userId);
    res.json(result);
  } catch (err) {
    console.error('[Google Relay] Error processing events:', err);
    res.status(500).json({ error: 'Failed to process events' });
  }
});

// ── GET /api/google-relay/log — recent relay log entries ──────

router.get('/log', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const status = req.query.status as string;

    let whereClause = 'c.user_id = $1';
    const params: any[] = [userId];

    if (status && ['sent', 'failed', 'skipped'].includes(status)) {
      whereClause += ` AND l.status = $2`;
      params.push(status);
    }

    const result = await pool.query(
      `SELECT l.id, l.config_id, l.event_id, l.event_name, l.ga4_event,
              l.status, l.error_message, l.sent_at, l.created_at,
              c.measurement_id
       FROM google_relay_log l
       JOIN google_relay_configs c ON c.id = l.config_id
       WHERE ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[Google Relay] Error fetching log:', err);
    res.status(500).json({ error: 'Failed to fetch relay log' });
  }
});

export default router;
