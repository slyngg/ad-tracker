import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// GET /api/notifications/preferences - Get user notification preferences
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, channel, event_type, enabled, config, created_at, updated_at
       FROM notification_preferences
       WHERE user_id = $1
       ORDER BY channel, event_type`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching notification preferences:', err);
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

// POST /api/notifications/preferences - Update notification preferences
// Body: { preferences: [{ channel, event_type, enabled, config }] }
router.post('/preferences', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { preferences } = req.body;

    if (!Array.isArray(preferences)) {
      res.status(400).json({ error: 'preferences must be an array' });
      return;
    }

    const results = [];
    for (const pref of preferences) {
      const { channel, event_type, enabled, config } = pref;

      if (!channel || !event_type) {
        continue;
      }

      const result = await pool.query(
        `INSERT INTO notification_preferences (user_id, channel, event_type, enabled, config)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, channel, event_type) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           config = EXCLUDED.config,
           updated_at = NOW()
         RETURNING *`,
        [userId, channel, event_type, enabled !== false, config ? JSON.stringify(config) : null]
      );
      results.push(result.rows[0]);
    }

    res.json(results);
  } catch (err) {
    console.error('Error updating notification preferences:', err);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// GET /api/notifications/unread-count - Return count of unread notifications
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
    res.json({ count: parseInt(result.rows[0].count) || 0 });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// GET /api/notifications - List recent notifications (last 50)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT id, type, title, message, data, read_at, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// POST /api/notifications/:id/read - Mark notification as read
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE id = $1 AND user_id = $2 AND read_at IS NULL
       RETURNING id, read_at`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Notification not found or already read' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

export default router;
