import cron from 'node-cron';
import { syncFacebook, syncFacebookCreatives } from './facebook-sync';
import { pollCheckoutChamp } from './cc-polling';
import { syncAllCCData } from './cc-sync';
import { syncGA4Data } from './ga4-sync';
import { syncShopifyProducts, syncShopifyCustomers } from './shopify-sync';
import { syncTikTokAds } from './tiktok-sync';
import { syncAllNewsBreakForUser } from './newsbreak-sync';
import { syncAllKlaviyoData } from './klaviyo-sync';
import { syncFollowedBrands } from './ad-library';
import { processUnsentEvents } from './meta-capi';
import { processUnsentEvents as processGoogleUnsentEvents } from './google-enhanced-conversions';
import { computeAttributionForAllUsers } from './pixel-attribution';
import { getSetting } from './settings';
import { evaluateRules } from './rules-engine';
import { checkThresholds } from './notifications';
import { tagUntaggedCreatives } from './creative-tagger';
import { refreshOAuthTokens } from './oauth-refresh';
import { getUsersAtMidnight } from './timezone';
import { getRealtime } from './realtime';
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
const LOCK_NEWSBREAK_SYNC = 100012;
const LOCK_PIXEL_ATTRIBUTION = 100015;

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
  // Meta Ads sync every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
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
              await evaluateRules(userId);
              await checkThresholds(userId);
              getRealtime()?.emitMetricsUpdate(userId);
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
              getRealtime()?.emitMetricsUpdate(userId);
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

            await pool.query(`
              INSERT INTO newsbreak_ads_archive (archived_date, ad_data, user_id, account_id)
              SELECT
                (NOW() AT TIME ZONE COALESCE(u.timezone, 'UTC'))::DATE - 1,
                row_to_json(n)::jsonb,
                n.user_id,
                n.account_id
              FROM newsbreak_ads_today n
              JOIN users u ON u.id = n.user_id
              WHERE n.user_id = $1
              ON CONFLICT DO NOTHING
            `, [userId]);

            // Delete archived data from _today tables for this user
            await pool.query('DELETE FROM fb_ads_today WHERE user_id = $1', [userId]);
            await pool.query('DELETE FROM cc_orders_today WHERE user_id = $1', [userId]);
            await pool.query('DELETE FROM cc_upsells_today WHERE user_id = $1', [userId]);
            await pool.query('DELETE FROM tiktok_ads_today WHERE user_id = $1', [userId]);
            await pool.query('DELETE FROM newsbreak_ads_today WHERE user_id = $1', [userId]);

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

              INSERT INTO newsbreak_ads_archive (archived_date, ad_data, user_id)
              SELECT CURRENT_DATE, row_to_json(newsbreak_ads_today)::jsonb, user_id
              FROM newsbreak_ads_today WHERE user_id IS NULL
              ON CONFLICT DO NOTHING;

              DELETE FROM fb_ads_today WHERE user_id IS NULL;
              DELETE FROM cc_orders_today WHERE user_id IS NULL;
              DELETE FROM cc_upsells_today WHERE user_id IS NULL;
              DELETE FROM tiktok_ads_today WHERE user_id IS NULL;
              DELETE FROM newsbreak_ads_today WHERE user_id IS NULL;
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
              try {
                await tagUntaggedCreatives(userId);
              } catch (err) {
                console.error(`[Scheduler] Creative tagging failed for user ${userId}:`, err);
              }
              getRealtime()?.emitMetricsUpdate(userId);
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

  // OAuth token refresh every hour (catches short-lived Google/TikTok tokens)
  const LOCK_TOKEN_REFRESH = 100005;
  cron.schedule('0 * * * *', async () => {
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
              getRealtime()?.emitMetricsUpdate(userId);
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
              getRealtime()?.emitMetricsUpdate(userId);
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
              getRealtime()?.emitMetricsUpdate(userId);
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

  // TikTok Ads sync every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
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
              getRealtime()?.emitMetricsUpdate(userId);
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

  // NewsBreak Ads sync every 2 minutes (offset by 1 min from Meta/TikTok)
  cron.schedule('1-59/2 * * * *', async () => {
    await withAdvisoryLock(LOCK_NEWSBREAK_SYNC, 'NewsBreak Ads sync', async () => {
      console.log('[Scheduler] Running NewsBreak Ads sync...');
      try {
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const result = await syncAllNewsBreakForUser(userId);
            if (!result.skipped && result.synced > 0) {
              console.log(`[Scheduler] NewsBreak sync for user ${userId}: ${result.synced} ad rows across ${result.accounts} account(s)`);
              await evaluateRules(userId);
              getRealtime()?.emitMetricsUpdate(userId);
            }
          } catch (err) {
            console.error(`[Scheduler] NewsBreak sync failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] NewsBreak Ads sync failed:', err);
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
                getRealtime()?.emitMetricsUpdate(userId);
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

  // Ad Library brand sync every 2 hours (offset from other syncs)
  const LOCK_AD_LIBRARY_SYNC = 100011;
  cron.schedule('45 */2 * * *', async () => {
    await withAdvisoryLock(LOCK_AD_LIBRARY_SYNC, 'Ad Library sync', async () => {
      console.log('[Scheduler] Running Ad Library brand sync...');
      try {
        const userIds = await getActiveUserIds();
        for (const userId of userIds) {
          try {
            const result = await syncFollowedBrands(userId);
            if (result.synced > 0) {
              console.log(`[Scheduler] Ad Library sync for user ${userId}: ${result.synced} ads cached`);
            }
          } catch (err) {
            console.error(`[Scheduler] Ad Library sync failed for user ${userId}:`, err);
          }
        }
      } catch (err) {
        console.error('[Scheduler] Ad Library sync failed:', err);
      }
    });
  });

  // Meta CAPI relay every 2 minutes (offset by 1 min from Meta Ads sync)
  const LOCK_CAPI_RELAY = 100013;
  cron.schedule('1-59/2 * * * *', async () => {
    await withAdvisoryLock(LOCK_CAPI_RELAY, 'Meta CAPI relay', async () => {
      try {
        const result = await processUnsentEvents();
        if (result.sent > 0 || result.failed > 0) {
          console.log(`[Scheduler] CAPI relay: ${result.sent} sent, ${result.failed} failed across ${result.configs} configs`);
        }
      } catch (err) {
        console.error('[Scheduler] Meta CAPI relay failed:', err);
      }
    });
  });

  // Google Enhanced Conversions relay every 2 minutes (offset from CAPI relay)
  const LOCK_GOOGLE_RELAY = 100014;
  cron.schedule('*/2 * * * *', async () => {
    await withAdvisoryLock(LOCK_GOOGLE_RELAY, 'Google relay', async () => {
      try {
        const result = await processGoogleUnsentEvents();
        if (result.totalSent > 0 || result.totalFailed > 0) {
          console.log(`[Scheduler] Google relay: ${result.totalSent} sent, ${result.totalFailed} failed, ${result.totalSkipped} skipped across ${result.configsProcessed} configs`);
        }
      } catch (err) {
        console.error('[Scheduler] Google Enhanced Conversions relay failed:', err);
      }
    });
  });

  // Pixel attribution computation daily at 3:00 AM UTC
  cron.schedule('0 3 * * *', async () => {
    await withAdvisoryLock(LOCK_PIXEL_ATTRIBUTION, 'Pixel attribution', async () => {
      console.log('[Scheduler] Running pixel attribution computation...');
      try {
        const result = await computeAttributionForAllUsers();
        if (result.totalOrders > 0) {
          console.log(`[Scheduler] Pixel attribution: ${result.usersProcessed} users, ${result.totalOrders} orders, ${result.totalResults} results`);
        }
      } catch (err) {
        console.error('[Scheduler] Pixel attribution computation failed:', err);
      }
    }, 10 * 60 * 1000); // 10-minute timeout for attribution (can be heavy)
  });

  console.log('[Scheduler] Cron jobs registered: Meta Ads (*/2), CC poll (* * *), GA4 (3,18,33,48), CC full sync (0 */4), Creative (5,35), Daily reset (0 *), OAuth refresh (0 *), Shopify (30 */6), TikTok (*/2), NewsBreak (1/2), Klaviyo (15 */2), Ad Library (45 */2), CAPI relay (1/2), Google relay (*/2), Pixel attribution (0 3)');
}
