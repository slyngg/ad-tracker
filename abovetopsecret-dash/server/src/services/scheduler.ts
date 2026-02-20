import cron from 'node-cron';
import { syncFacebook } from './facebook-sync';
import { pollCheckoutChamp } from './cc-polling';
import { getSetting } from './settings';
import pool from '../db';
import fs from 'fs';
import path from 'path';

export function startScheduler(): void {
  // Facebook sync every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    console.log('[Scheduler] Running Facebook sync...');
    try {
      const result = await syncFacebook();
      console.log(`[Scheduler] FB sync complete: ${result.synced} rows from ${result.accounts} accounts`);
    } catch (err) {
      console.error('[Scheduler] FB sync failed:', err);
    }
  });

  // CheckoutChamp API polling every minute
  cron.schedule('* * * * *', async () => {
    try {
      const pollEnabled = await getSetting('cc_poll_enabled');
      if (pollEnabled === 'false') return;

      const result = await pollCheckoutChamp();
      if (result.inserted > 0) {
        console.log(`[Scheduler] CC poll: ${result.inserted} orders inserted (${result.polled} total)`);
      }
    } catch (err) {
      console.error('[Scheduler] CC poll failed:', err);
    }
  });

  // Daily reset at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('[Scheduler] Running daily reset...');
    try {
      const resetSql = fs.readFileSync(
        path.join(__dirname, '../../db/reset-daily.sql'),
        'utf-8'
      );
      await pool.query(resetSql);
      console.log('[Scheduler] Daily reset complete');
    } catch (err) {
      // Fallback: run inline if file not found
      console.warn('[Scheduler] Could not read reset-daily.sql, running inline reset');
      try {
        await pool.query(`
          INSERT INTO fb_ads_archive (archived_date, ad_data)
          SELECT CURRENT_DATE, row_to_json(fb_ads_today)::jsonb FROM fb_ads_today;

          INSERT INTO orders_archive (archived_date, order_data)
          SELECT CURRENT_DATE, row_to_json(cc_orders_today)::jsonb FROM cc_orders_today;

          TRUNCATE fb_ads_today RESTART IDENTITY;
          TRUNCATE cc_orders_today RESTART IDENTITY;
          TRUNCATE cc_upsells_today RESTART IDENTITY;
        `);
        console.log('[Scheduler] Inline daily reset complete');
      } catch (innerErr) {
        console.error('[Scheduler] Daily reset failed:', innerErr);
      }
    }
  });

  console.log('[Scheduler] Cron jobs registered: FB sync (*/10 * * * *), CC poll (* * * * *), Daily reset (0 0 * * *)');
}
