import cron from 'node-cron';
import { syncFacebook } from './facebook-sync';
import { pollCheckoutChamp } from './cc-polling';
import { getSetting } from './settings';
import { evaluateRules } from './rules-engine';
import { checkThresholds } from './notifications';
import pool from '../db';

async function getActiveUserIds(): Promise<number[]> {
  try {
    const result = await pool.query(
      'SELECT DISTINCT id FROM users'
    );
    return result.rows.map(r => r.id);
  } catch {
    return [];
  }
}

// Advisory lock IDs (arbitrary, unique per job)
const LOCK_FB_SYNC = 100001;
const LOCK_CC_POLL = 100002;
const LOCK_DAILY_RESET = 100003;

async function withAdvisoryLock(lockId: number, label: string, fn: () => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
    if (!lockResult.rows[0].acquired) {
      console.log(`[Scheduler] ${label}: skipped (another instance holds the lock)`);
      return;
    }
    try {
      await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  } finally {
    client.release();
  }
}

export function startScheduler(): void {
  // Meta Ads sync every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    await withAdvisoryLock(LOCK_FB_SYNC, 'Meta Ads sync', async () => {
      console.log('[Scheduler] Running Meta Ads sync...');
      try {
        // First, run legacy (no-user) sync for backward compatibility
        const legacyResult = await syncFacebook();
        if (legacyResult.synced > 0) {
          console.log(`[Scheduler] Legacy Meta sync: ${legacyResult.synced} rows from ${legacyResult.accounts} accounts`);
        }

        // Then sync for each user who has configured credentials
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const result = await syncFacebook(userId);
            if (!result.skipped && result.synced > 0) {
              console.log(`[Scheduler] Meta sync for user ${userId}: ${result.synced} rows`);
              // Run rules after successful sync
              await evaluateRules(userId);
              await checkThresholds(userId);
            }
          } catch (err) {
            console.error(`[Scheduler] Meta sync failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] Meta Ads sync failed:', err);
      }
    });
  });

  // CheckoutChamp API polling every minute — per-user iteration
  cron.schedule('* * * * *', async () => {
    await withAdvisoryLock(LOCK_CC_POLL, 'CC poll', async () => {
      try {
        // Legacy global poll for backward compatibility
        const globalPollEnabled = await getSetting('cc_poll_enabled');
        if (globalPollEnabled !== 'false') {
          const legacyResult = await pollCheckoutChamp();
          if (legacyResult.inserted > 0) {
            console.log(`[Scheduler] CC poll (legacy): ${legacyResult.inserted} orders inserted (${legacyResult.polled} total)`);
          }
        }

        // Per-user CC polling
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const pollEnabled = await getSetting('cc_poll_enabled', userId);
            if (pollEnabled === 'false') continue;

            const result = await pollCheckoutChamp(userId);
            if (result.inserted > 0) {
              console.log(`[Scheduler] CC poll for user ${userId}: ${result.inserted} orders inserted (${result.polled} total)`);
              await evaluateRules(userId);
              await checkThresholds(userId);
            }
          } catch (err) {
            console.error(`[Scheduler] CC poll failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] CC poll failed:', err);
      }
    });
  });

  // Daily reset at midnight
  cron.schedule('0 0 * * *', async () => {
    await withAdvisoryLock(LOCK_DAILY_RESET, 'Daily reset', async () => {
      console.log('[Scheduler] Running daily reset...');
      try {
        await pool.query(`
          INSERT INTO fb_ads_archive (archived_date, ad_data, user_id)
          SELECT CURRENT_DATE, row_to_json(fb_ads_today)::jsonb, user_id FROM fb_ads_today;

          INSERT INTO orders_archive (archived_date, order_data, user_id)
          SELECT CURRENT_DATE, row_to_json(cc_orders_today)::jsonb, user_id FROM cc_orders_today;

          TRUNCATE fb_ads_today RESTART IDENTITY;
          TRUNCATE cc_orders_today RESTART IDENTITY;
          TRUNCATE cc_upsells_today RESTART IDENTITY;
        `);
        console.log('[Scheduler] Daily reset complete');
      } catch (err) {
        console.error('[Scheduler] Daily reset failed:', err);
      }
    });
  });

  console.log('[Scheduler] Cron jobs registered: Meta Ads sync (*/10 * * * *), CC poll (* * * * *), Daily reset (0 0 * * *)');
}
