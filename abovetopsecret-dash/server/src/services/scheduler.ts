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

export function startScheduler(): void {
  // Facebook sync every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    console.log('[Scheduler] Running Facebook sync...');
    try {
      // First, run legacy (no-user) sync for backward compatibility
      const legacyResult = await syncFacebook();
      if (legacyResult.synced > 0) {
        console.log(`[Scheduler] Legacy FB sync: ${legacyResult.synced} rows from ${legacyResult.accounts} accounts`);
      }

      // Then sync for each user who has configured FB credentials
      const userIds = await getActiveUserIds();
      for (const userId of userIds) {
        try {
          const result = await syncFacebook(userId);
          if (!result.skipped && result.synced > 0) {
            console.log(`[Scheduler] FB sync for user ${userId}: ${result.synced} rows`);
            // Run rules after successful sync
            await evaluateRules(userId);
            await checkThresholds(userId);
          }
        } catch (err) {
          console.error(`[Scheduler] FB sync failed for user ${userId}:`, err);
        }
      }
    } catch (err) {
      console.error('[Scheduler] FB sync failed:', err);
    }
  });

  // CheckoutChamp API polling every minute — per-user iteration
  cron.schedule('* * * * *', async () => {
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

  // Daily reset at midnight
  cron.schedule('0 0 * * *', async () => {
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

  console.log('[Scheduler] Cron jobs registered: FB sync (*/10 * * * *), CC poll (* * * * *), Daily reset (0 0 * * *)');
}
