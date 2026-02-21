import cron from 'node-cron';
import { syncFacebook, syncFacebookCreatives } from './facebook-sync';
import { pollCheckoutChamp } from './cc-polling';
import { syncAllCCData } from './cc-sync';
import { syncGA4Data } from './ga4-sync';
import { syncShopifyProducts, syncShopifyCustomers } from './shopify-sync';
import { syncTikTokAds } from './tiktok-sync';
import { syncAllKlaviyoData } from './klaviyo-sync';
import { getSetting } from './settings';
import { evaluateRules } from './rules-engine';
import { checkThresholds } from './notifications';
import { tagUntaggedCreatives } from './creative-tagger';
import { refreshOAuthTokens } from './oauth-refresh';
import { getUsersAtMidnight } from './timezone';
import pool from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('Scheduler');

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
const LOCK_GA4_SYNC = 100006;
const LOCK_CC_FULL_SYNC = 100007;
const LOCK_SHOPIFY_SYNC = 100008;
const LOCK_TIKTOK_SYNC = 100009;
const LOCK_KLAVIYO_SYNC = 100010;

async function withAdvisoryLock(
  lockId: number,
  label: string,
  fn: () => Promise<void>,
  timeoutMs = 5 * 60 * 1000,
): Promise<void> {
  const client = await pool.connect();
  try {
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1) AS acquired', [lockId]);
    if (!lockResult.rows[0].acquired) {
      log.info({ lockId, label }, `${label}: skipped (another instance holds the lock)`);
      return;
    }
    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`)), timeoutMs)
        ),
      ]);
    } catch (err) {
      log.error({ lockId, label, err }, `${label}: lock released after error`);
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

  // Timezone-aware daily reset — runs every hour, archives data for users whose
  // midnight just passed in their configured timezone. Uses DELETE per-user
  // instead of TRUNCATE so different users reset at different times.
  cron.schedule('0 * * * *', async () => {
    await withAdvisoryLock(LOCK_DAILY_RESET, 'Daily reset', async () => {
      try {
        const usersAtMidnight = await getUsersAtMidnight();
        if (usersAtMidnight.length === 0) {
          return; // No users at midnight right now
        }

        console.log(`[Scheduler] Daily reset for ${usersAtMidnight.length} user(s) at their local midnight: [${usersAtMidnight.join(', ')}]`);

        for (const userId of usersAtMidnight) {
          try {
            // Archive the user's data with ON CONFLICT DO NOTHING to prevent double-archiving
            // The archived_date is "yesterday" in the user's timezone
            await pool.query(`
              INSERT INTO fb_ads_archive (archived_date, ad_data, user_id, account_id)
              SELECT
                (NOW() AT TIME ZONE COALESCE(u.timezone, 'UTC'))::DATE - 1,
                row_to_json(f)::jsonb,
                f.user_id,
                f.account_id
              FROM fb_ads_today f
              JOIN users u ON u.id = f.user_id
              WHERE f.user_id = $1
              ON CONFLICT DO NOTHING
            `, [userId]);

            await pool.query(`
              INSERT INTO orders_archive (archived_date, order_data, user_id, account_id, offer_id)
              SELECT
                (NOW() AT TIME ZONE COALESCE(u.timezone, 'UTC'))::DATE - 1,
                row_to_json(o)::jsonb,
                o.user_id,
                o.account_id,
                o.offer_id
              FROM cc_orders_today o
              JOIN users u ON u.id = o.user_id
              WHERE o.user_id = $1
              ON CONFLICT DO NOTHING
            `, [userId]);

            await pool.query(`
              INSERT INTO tiktok_ads_archive (archived_date, ad_data, user_id, account_id)
              SELECT
                (NOW() AT TIME ZONE COALESCE(u.timezone, 'UTC'))::DATE - 1,
                row_to_json(t)::jsonb,
                t.user_id,
                t.account_id
              FROM tiktok_ads_today t
              JOIN users u ON u.id = t.user_id
              WHERE t.user_id = $1
              ON CONFLICT DO NOTHING
            `, [userId]);

            // Delete archived data from _today tables for this user
            await pool.query('DELETE FROM fb_ads_today WHERE user_id = $1', [userId]);
            await pool.query('DELETE FROM cc_orders_today WHERE user_id = $1', [userId]);
            await pool.query('DELETE FROM cc_upsells_today WHERE user_id = $1', [userId]);
            await pool.query('DELETE FROM tiktok_ads_today WHERE user_id = $1', [userId]);

            console.log(`[Scheduler] Daily reset complete for user ${userId}`);
          } catch (err) {
            console.error(`[Scheduler] Daily reset failed for user ${userId}:`, err);
          }
        }

        // Also archive/delete legacy rows (user_id IS NULL) at UTC midnight
        const utcHour = new Date().getUTCHours();
        if (utcHour === 0) {
          try {
            await pool.query(`
              INSERT INTO fb_ads_archive (archived_date, ad_data, user_id)
              SELECT CURRENT_DATE, row_to_json(fb_ads_today)::jsonb, user_id
              FROM fb_ads_today WHERE user_id IS NULL
              ON CONFLICT DO NOTHING;

              INSERT INTO orders_archive (archived_date, order_data, user_id)
              SELECT CURRENT_DATE, row_to_json(cc_orders_today)::jsonb, user_id
              FROM cc_orders_today WHERE user_id IS NULL
              ON CONFLICT DO NOTHING;

              INSERT INTO tiktok_ads_archive (archived_date, ad_data, user_id)
              SELECT CURRENT_DATE, row_to_json(tiktok_ads_today)::jsonb, user_id
              FROM tiktok_ads_today WHERE user_id IS NULL
              ON CONFLICT DO NOTHING;

              DELETE FROM fb_ads_today WHERE user_id IS NULL;
              DELETE FROM cc_orders_today WHERE user_id IS NULL;
              DELETE FROM cc_upsells_today WHERE user_id IS NULL;
              DELETE FROM tiktok_ads_today WHERE user_id IS NULL;
            `);
            console.log('[Scheduler] Legacy (null user_id) daily reset complete');
          } catch (err) {
            console.error('[Scheduler] Legacy daily reset failed:', err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] Daily reset failed:', err);
      }
    });
  });

  // Creative sync every 30 minutes (offset from main sync)
  const LOCK_CREATIVE_SYNC = 100004;
  cron.schedule('5,35 * * * *', async () => {
    await withAdvisoryLock(LOCK_CREATIVE_SYNC, 'Creative sync', async () => {
      console.log('[Scheduler] Running creative sync...');
      try {
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const result = await syncFacebookCreatives(userId);
            if (!result.skipped && result.synced > 0) {
              console.log(`[Scheduler] Creative sync for user ${userId}: ${result.synced} creatives, ${result.metrics} metrics`);
              // Run AI tagging after sync
              try {
                await tagUntaggedCreatives(userId);
              } catch (err) {
                console.error(`[Scheduler] Creative tagging failed for user ${userId}:`, err);
              }
            }
          } catch (err) {
            console.error(`[Scheduler] Creative sync failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] Creative sync failed:', err);
      }
    });
  });

  // OAuth token refresh every 6 hours
  const LOCK_TOKEN_REFRESH = 100005;
  cron.schedule('0 */6 * * *', async () => {
    await withAdvisoryLock(LOCK_TOKEN_REFRESH, 'OAuth token refresh', async () => {
      console.log('[Scheduler] Running OAuth token refresh...');
      try {
        const result = await refreshOAuthTokens();
        if (result.refreshed > 0) {
          console.log(`[Scheduler] Refreshed ${result.refreshed} OAuth tokens (${result.failed} failed)`);
        }
      } catch (err) {
        console.error('[Scheduler] OAuth token refresh failed:', err);
      }
    });
  });

  // GA4 sync every 15 minutes (offset from Meta)
  cron.schedule('3,18,33,48 * * * *', async () => {
    await withAdvisoryLock(LOCK_GA4_SYNC, 'GA4 sync', async () => {
      console.log('[Scheduler] Running GA4 sync...');
      try {
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const result = await syncGA4Data(userId);
            if (result.synced > 0) {
              console.log(`[Scheduler] GA4 sync for user ${userId}: ${result.synced} rows`);
              await evaluateRules(userId);
            }
          } catch (err) {
            console.error(`[Scheduler] GA4 sync failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] GA4 sync failed:', err);
      }
    });
  });

  // CheckoutChamp full data sync every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    await withAdvisoryLock(LOCK_CC_FULL_SYNC, 'CC full data sync', async () => {
      console.log('[Scheduler] Running CC full data sync...');
      try {
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const result = await syncAllCCData(userId);
            const total = result.orders + result.purchases + result.campaigns;
            if (total > 0) {
              console.log(`[Scheduler] CC full sync for user ${userId}: ${result.orders} orders, ${result.purchases} purchases, ${result.campaigns} campaigns`);
            }
          } catch (err) {
            console.error(`[Scheduler] CC full sync failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] CC full data sync failed:', err);
      }
    });
  });

  // Shopify products + customers every 6 hours
  cron.schedule('30 */6 * * *', async () => {
    await withAdvisoryLock(LOCK_SHOPIFY_SYNC, 'Shopify sync', async () => {
      console.log('[Scheduler] Running Shopify sync...');
      try {
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const products = await syncShopifyProducts(userId);
            const customers = await syncShopifyCustomers(userId);
            if (!products.skipped && (products.synced > 0 || customers.synced > 0)) {
              console.log(`[Scheduler] Shopify sync for user ${userId}: ${products.synced} products, ${customers.synced} customers`);
            }
          } catch (err) {
            console.error(`[Scheduler] Shopify sync failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] Shopify sync failed:', err);
      }
    });
  });

  // TikTok Ads sync every 10 minutes (same cadence as Meta)
  cron.schedule('*/10 * * * *', async () => {
    await withAdvisoryLock(LOCK_TIKTOK_SYNC, 'TikTok Ads sync', async () => {
      console.log('[Scheduler] Running TikTok Ads sync...');
      try {
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const result = await syncTikTokAds(userId);
            if (!result.skipped && result.synced > 0) {
              console.log(`[Scheduler] TikTok sync for user ${userId}: ${result.synced} ad rows`);
              await evaluateRules(userId);
            }
          } catch (err) {
            console.error(`[Scheduler] TikTok sync failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] TikTok Ads sync failed:', err);
      }
    });
  });

  // Klaviyo sync every 2 hours
  cron.schedule('15 */2 * * *', async () => {
    await withAdvisoryLock(LOCK_KLAVIYO_SYNC, 'Klaviyo sync', async () => {
      console.log('[Scheduler] Running Klaviyo sync...');
      try {
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const result = await syncAllKlaviyoData(userId);
            if (!result.skipped) {
              const total = result.profiles + result.lists + result.campaigns + result.flowMetrics;
              if (total > 0) {
                console.log(`[Scheduler] Klaviyo sync for user ${userId}: ${result.profiles} profiles, ${result.lists} lists, ${result.campaigns} campaigns, ${result.flowMetrics} flow metrics`);
              }
            }
          } catch (err) {
            console.error(`[Scheduler] Klaviyo sync failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] Klaviyo sync failed:', err);
      }
    });
  });

  console.log('[Scheduler] Cron jobs registered: Meta Ads (*/10), CC poll (* * *), GA4 (3,18,33,48), CC full sync (0 */4), Creative (5,35), Daily reset (0 *), OAuth refresh (0 */6), Shopify (30 */6), TikTok (*/10), Klaviyo (15 */2)');
}
