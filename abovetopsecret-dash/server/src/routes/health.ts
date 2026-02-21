import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

interface HealthCheck {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message?: string;
  value?: number | string;
}

// GET /api/health — basic health
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT 1');
    res.json({ status: 'ok', db: result.rows.length > 0 });
  } catch {
    res.status(503).json({ status: 'error', db: false });
  }
});

// GET /api/health/data — data discrepancy detection
router.get('/data', async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const checks: HealthCheck[] = [];

  try {
    // 1. Stale syncs — any sync table not updated in expected interval
    const staleSyncChecks = [
      { table: 'fb_ads_today', label: 'Meta Ads', maxAgeMinutes: 20 },
      { table: 'cc_orders_today', label: 'CheckoutChamp Orders', maxAgeMinutes: 5 },
      { table: 'tiktok_ads_today', label: 'TikTok Ads', maxAgeMinutes: 20 },
      { table: 'ga4_sessions', label: 'GA4 Sessions', maxAgeMinutes: 30 },
    ];

    for (const { table, label, maxAgeMinutes } of staleSyncChecks) {
      try {
        const result = await pool.query(
          `SELECT MAX(synced_at) AS last_sync FROM ${table} WHERE ($1::int IS NULL OR user_id = $1)`,
          [userId || null]
        );
        const lastSync = result.rows[0]?.last_sync;
        if (!lastSync) {
          checks.push({ name: `${label} sync`, status: 'warn', message: 'No data found' });
        } else {
          const ageMs = Date.now() - new Date(lastSync).getTime();
          const ageMinutes = Math.round(ageMs / 60000);
          if (ageMinutes > maxAgeMinutes) {
            checks.push({
              name: `${label} sync`,
              status: 'warn',
              message: `Last sync ${ageMinutes}m ago (threshold: ${maxAgeMinutes}m)`,
              value: ageMinutes,
            });
          } else {
            checks.push({ name: `${label} sync`, status: 'ok', value: `${ageMinutes}m ago` });
          }
        }
      } catch {
        checks.push({ name: `${label} sync`, status: 'error', message: `Table ${table} not accessible` });
      }
    }

    // 2. Negative values in critical columns (should never happen with CHECK constraints)
    const negativeChecks = [
      { table: 'fb_ads_today', col: 'spend', label: 'Meta negative spend' },
      { table: 'cc_orders_today', col: 'revenue', label: 'CC negative revenue' },
      { table: 'tiktok_ads_today', col: 'spend', label: 'TikTok negative spend' },
    ];

    for (const { table, col, label } of negativeChecks) {
      try {
        const result = await pool.query(
          `SELECT COUNT(*) AS cnt FROM ${table} WHERE ${col} < 0 AND ($1::int IS NULL OR user_id = $1)`,
          [userId || null]
        );
        const count = parseInt(result.rows[0]?.cnt || '0');
        if (count > 0) {
          checks.push({ name: label, status: 'error', message: `${count} rows with negative values`, value: count });
        } else {
          checks.push({ name: label, status: 'ok' });
        }
      } catch {
        // Table may not exist
      }
    }

    // 3. Orphaned data — orders without matching ads (spend/revenue mismatch signal)
    try {
      const result = await pool.query(`
        SELECT
          COALESCE(SUM(f.spend), 0) AS total_spend,
          COALESCE(SUM(o.revenue), 0) AS total_revenue
        FROM (SELECT SUM(spend) AS spend FROM fb_ads_today WHERE ($1::int IS NULL OR user_id = $1)) f,
             (SELECT SUM(COALESCE(subtotal, revenue)) AS revenue FROM cc_orders_today WHERE order_status = 'completed' AND ($1::int IS NULL OR user_id = $1)) o
      `, [userId || null]);

      const { total_spend, total_revenue } = result.rows[0] || {};
      const spend = parseFloat(total_spend) || 0;
      const revenue = parseFloat(total_revenue) || 0;

      if (spend > 0 && revenue === 0) {
        checks.push({ name: 'Spend/Revenue gap', status: 'warn', message: `Spend: $${spend.toFixed(2)} but $0 revenue` });
      } else if (revenue > 0 && spend === 0) {
        checks.push({ name: 'Spend/Revenue gap', status: 'warn', message: `Revenue: $${revenue.toFixed(2)} but $0 spend` });
      } else {
        checks.push({ name: 'Spend/Revenue gap', status: 'ok' });
      }
    } catch {
      // Ignore if tables don't exist
    }

    // 4. Duplicate detection — same order_id appearing multiple times
    try {
      const result = await pool.query(`
        SELECT order_id, COUNT(*) AS cnt
        FROM cc_orders_today
        WHERE ($1::int IS NULL OR user_id = $1)
        GROUP BY order_id, user_id
        HAVING COUNT(*) > 1
        LIMIT 5
      `, [userId || null]);

      if (result.rows.length > 0) {
        checks.push({
          name: 'Duplicate orders',
          status: 'warn',
          message: `${result.rows.length} duplicate order_id(s) found`,
          value: result.rows.length,
        });
      } else {
        checks.push({ name: 'Duplicate orders', status: 'ok' });
      }
    } catch {
      // Ignore
    }

    // 5. Advisory lock leak detection
    try {
      const result = await pool.query(`
        SELECT classid, objid, mode, granted
        FROM pg_locks
        WHERE locktype = 'advisory' AND granted = true
      `);
      const lockCount = result.rows.length;
      if (lockCount > 3) {
        checks.push({ name: 'Advisory locks held', status: 'warn', message: `${lockCount} advisory locks currently held`, value: lockCount });
      } else {
        checks.push({ name: 'Advisory locks held', status: 'ok', value: lockCount });
      }
    } catch {
      // May not have permissions
    }

    const overallStatus = checks.some(c => c.status === 'error') ? 'error'
      : checks.some(c => c.status === 'warn') ? 'warn' : 'ok';

    res.json({ status: overallStatus, checks, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[Health] Data check failed:', err);
    res.status(500).json({ status: 'error', error: 'Health check failed' });
  }
});

export default router;
