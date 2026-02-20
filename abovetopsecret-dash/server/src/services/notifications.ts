import pool from '../db';

export async function checkThresholds(userId: number): Promise<void> {
  try {
    // Get current metrics
    const adsResult = await pool.query(
      'SELECT COALESCE(SUM(spend), 0) AS spend FROM fb_ads_today WHERE user_id = $1',
      [userId]
    );
    const ordersResult = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
              COUNT(DISTINCT order_id) AS conversions
       FROM cc_orders_today WHERE order_status = 'completed' AND user_id = $1`,
      [userId]
    );

    const spend = parseFloat(adsResult.rows[0].spend) || 0;
    const revenue = parseFloat(ordersResult.rows[0].revenue) || 0;
    const conversions = parseInt(ordersResult.rows[0].conversions) || 0;
    const roas = spend > 0 ? revenue / spend : 0;

    // Get user's notification preferences
    const prefsResult = await pool.query(
      'SELECT * FROM notification_preferences WHERE user_id = $1 AND enabled = true',
      [userId]
    );

    for (const pref of prefsResult.rows) {
      const config = pref.config || {};

      if (pref.event_type === 'spend_threshold' && config.threshold) {
        if (spend > parseFloat(config.threshold)) {
          await createNotificationIfNew(userId, 'spend_alert',
            'Spend threshold exceeded',
            `Daily spend ($${spend.toFixed(2)}) exceeded your threshold ($${config.threshold}).`
          );
        }
      }

      if (pref.event_type === 'roas_floor' && config.threshold) {
        if (spend > 0 && roas < parseFloat(config.threshold)) {
          await createNotificationIfNew(userId, 'roas_alert',
            'ROAS below threshold',
            `Current ROAS (${roas.toFixed(2)}x) is below your minimum (${config.threshold}x).`
          );
        }
      }

      if (pref.event_type === 'zero_conversions') {
        if (spend > 10 && conversions === 0) {
          await createNotificationIfNew(userId, 'conversion_alert',
            'Zero conversions detected',
            `You've spent $${spend.toFixed(2)} today with no conversions.`
          );
        }
      }
    }
  } catch (err) {
    console.error(`[Notifications] Error checking thresholds for user ${userId}:`, err);
  }
}

async function createNotificationIfNew(
  userId: number, type: string, title: string, message: string
): Promise<void> {
  // Prevent duplicate notifications within the same day
  const existing = await pool.query(
    `SELECT id FROM notifications
     WHERE user_id = $1 AND type = $2 AND created_at > CURRENT_DATE`,
    [userId, type]
  );

  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)`,
      [userId, type, title, message]
    );
  }
}
