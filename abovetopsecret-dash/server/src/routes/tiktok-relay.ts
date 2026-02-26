import { Router, Request, Response } from 'express';
import pool from '../db';
import { encrypt } from '../services/oauth-providers';
import {
  getRelayStats,
  sendTestEvent,
  processUnsentEventsForUser,
  EVENT_MAP,
  MAPPED_EVENTS,
} from '../services/tiktok-events-api';

const router = Router();

// ── GET /api/tiktok-relay/configs — list user's relay configs ─

router.get('/configs', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, user_id, tiktok_pixel_id, access_token_ref, enabled,
              test_event_code, event_filter, created_at, updated_at
       FROM tiktok_relay_configs
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
    console.error('[TikTok Relay] Error fetching configs:', err);
    res.status(500).json({ error: 'Failed to fetch TikTok relay configs' });
  }
});

// ── POST /api/tiktok-relay/configs — create or update config ──

router.post('/configs', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      id,
      tiktok_pixel_id,
      access_token_ref,
      access_token,
      enabled,
      test_event_code,
      event_filter,
    } = req.body;

    if (!tiktok_pixel_id) {
      return res.status(400).json({ error: 'tiktok_pixel_id is required' });
    }

    // Encrypt manual access token if provided
    let accessTokenEnc: string | null = null;
    if (access_token_ref === 'manual' && access_token) {
      accessTokenEnc = encrypt(access_token);
    }

    if (id) {
      // Update existing config
      const result = await pool.query(
        `UPDATE tiktok_relay_configs SET
           tiktok_pixel_id = $1,
           access_token_ref = $2,
           access_token_enc = COALESCE($3, access_token_enc),
           enabled = $4,
           test_event_code = $5,
           event_filter = $6,
           updated_at = NOW()
         WHERE id = $7 AND user_id = $8
         RETURNING id, user_id, tiktok_pixel_id, access_token_ref, enabled,
                   test_event_code, event_filter, created_at, updated_at`,
        [
          tiktok_pixel_id,
          access_token_ref || 'oauth',
          accessTokenEnc,
          enabled !== false,
          test_event_code || null,
          JSON.stringify(event_filter || []),
          id,
          userId,
        ],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Config not found' });
      }

      return res.json(result.rows[0]);
    }

    // Create new config
    const result = await pool.query(
      `INSERT INTO tiktok_relay_configs (user_id, tiktok_pixel_id, access_token_ref, access_token_enc, enabled, test_event_code, event_filter)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, tiktok_pixel_id) DO UPDATE SET
         access_token_ref = EXCLUDED.access_token_ref,
         access_token_enc = COALESCE(EXCLUDED.access_token_enc, tiktok_relay_configs.access_token_enc),
         enabled = EXCLUDED.enabled,
         test_event_code = EXCLUDED.test_event_code,
         event_filter = EXCLUDED.event_filter,
         updated_at = NOW()
       RETURNING id, user_id, tiktok_pixel_id, access_token_ref, enabled,
                 test_event_code, event_filter, created_at, updated_at`,
      [
        userId,
        tiktok_pixel_id,
        access_token_ref || 'oauth',
        accessTokenEnc,
        enabled !== false,
        test_event_code || null,
        JSON.stringify(event_filter || []),
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[TikTok Relay] Error saving config:', err);
    res.status(500).json({ error: 'Failed to save TikTok relay config' });
  }
});

// ── DELETE /api/tiktok-relay/configs/:id — delete a config ────

router.delete('/configs/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM tiktok_relay_configs WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Config not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[TikTok Relay] Error deleting config:', err);
    res.status(500).json({ error: 'Failed to delete TikTok relay config' });
  }
});

// ── GET /api/tiktok-relay/stats — relay statistics ────────────

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const stats = await getRelayStats(userId);
    res.json(stats);
  } catch (err) {
    console.error('[TikTok Relay] Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch relay stats' });
  }
});

// ── POST /api/tiktok-relay/test — send a test event ───────────

router.post('/test', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { config_id } = req.body;

    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (!config_id) return res.status(400).json({ error: 'config_id is required' });

    const result = await sendTestEvent(config_id, userId);
    res.json(result);
  } catch (err: any) {
    console.error('[TikTok Relay] Error sending test event:', err);
    res.status(500).json({ error: err.message || 'Failed to send test event' });
  }
});

// ── POST /api/tiktok-relay/process — manually trigger relay ───

router.post('/process', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const result = await processUnsentEventsForUser(userId);
    res.json(result);
  } catch (err) {
    console.error('[TikTok Relay] Error processing events:', err);
    res.status(500).json({ error: 'Failed to process events' });
  }
});

// ── GET /api/tiktok-relay/log — recent relay log entries ──────

router.get('/log', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const status = req.query.status as string;

    let whereClause = 'c.user_id = $1';
    const params: any[] = [userId];

    if (status && ['sent', 'failed', 'skipped'].includes(status)) {
      whereClause += ` AND l.status = $2`;
      params.push(status);
    }

    const result = await pool.query(
      `SELECT l.id, l.config_id, l.event_id, l.event_name, l.tiktok_event,
              l.status, l.error_message, l.sent_at, l.created_at,
              c.tiktok_pixel_id
       FROM tiktok_relay_log l
       JOIN tiktok_relay_configs c ON c.id = l.config_id
       WHERE ${whereClause}
       ORDER BY l.created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[TikTok Relay] Error fetching log:', err);
    res.status(500).json({ error: 'Failed to fetch relay log' });
  }
});

export default router;
