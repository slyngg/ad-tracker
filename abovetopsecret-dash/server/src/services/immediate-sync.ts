/**
 * Immediate Sync Service
 *
 * Triggers platform syncs immediately after OAuth connection or onboarding completion.
 * All syncs run async (fire-and-forget) so the caller isn't blocked.
 * Emits WebSocket events on completion so the client knows data is ready.
 */

import { syncFacebook, syncFacebookCreatives, backfillFacebook } from './facebook-sync';
import { syncGA4Data } from './ga4-sync';
import { syncShopifyProducts, syncShopifyCustomers } from './shopify-sync';
import { syncTikTokAds } from './tiktok-sync';
import { syncAllKlaviyoData } from './klaviyo-sync';
import { syncAllCCData } from './cc-sync';
import { syncAllNewsBreakForUser } from './newsbreak-sync';
import { getRealtime } from './realtime';
import { evaluateRules } from './rules-engine';
import { tagUntaggedCreatives } from './creative-tagger';
import pool from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('ImmediateSync');

export type SyncPlatform = 'meta' | 'google' | 'shopify' | 'tiktok' | 'klaviyo' | 'checkoutChamp' | 'newsbreak';

interface SyncResult {
  platform: SyncPlatform;
  success: boolean;
  detail?: string;
}

/**
 * Trigger an immediate sync for a specific platform.
 * Runs async — does not block. Emits WS events when done.
 */
export function triggerPlatformSync(userId: number, platform: SyncPlatform): void {
  // Fire and forget — don't await
  runPlatformSync(userId, platform).catch((err) => {
    log.error({ userId, platform, err }, 'Immediate sync failed');
  });
}

/**
 * Trigger immediate syncs for ALL connected platforms for a user.
 * Used after onboarding completion.
 */
export async function triggerAllConnectedSyncs(userId: number): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT platform FROM integration_configs WHERE user_id = $1 AND status = 'connected'`,
      [userId]
    );

    const platforms = result.rows.map((r) => r.platform as SyncPlatform);
    log.info({ userId, platforms }, 'Triggering immediate sync for all connected platforms');

    // Emit a sync_started event so the client can show progress
    getRealtime()?.emitSyncStatus(userId, {
      status: 'syncing',
      platforms: platforms.map((p) => ({ platform: p, status: 'syncing' as const })),
    });

    // Run all syncs concurrently
    const results = await Promise.allSettled(
      platforms.map((p) => runPlatformSync(userId, p))
    );

    const syncResults: SyncResult[] = results.map((r, i) => ({
      platform: platforms[i],
      success: r.status === 'fulfilled' && r.value.success,
      detail: r.status === 'fulfilled' ? r.value.detail : (r.reason?.message || 'Unknown error'),
    }));

    // Emit final status
    getRealtime()?.emitSyncStatus(userId, {
      status: 'complete',
      platforms: syncResults.map((r) => ({
        platform: r.platform,
        status: r.success ? 'done' as const : 'error' as const,
      })),
    });

    // Emit metrics update so dashboard refreshes
    getRealtime()?.emitMetricsUpdate(userId);

    log.info({ userId, syncResults }, 'All immediate syncs completed');
  } catch (err) {
    log.error({ userId, err }, 'Failed to trigger all connected syncs');
  }
}

async function runPlatformSync(
  userId: number,
  platform: SyncPlatform
): Promise<{ success: boolean; detail?: string }> {
  log.info({ userId, platform }, 'Starting immediate sync');

  // Notify client this platform is syncing
  getRealtime()?.emitSyncStatus(userId, {
    status: 'syncing',
    platforms: [{ platform, status: 'syncing' }],
  });

  try {
    switch (platform) {
      case 'meta': {
        const result = await syncFacebook(userId);
        if (!result.skipped && result.synced > 0) {
          await evaluateRules(userId);
        }
        // Also sync creatives in background
        syncFacebookCreatives(userId)
          .then(async (cr) => {
            if (!cr.skipped && cr.synced > 0) {
              try { await tagUntaggedCreatives(userId); } catch {}
            }
          })
          .catch(() => {});

        // Auto-backfill if this looks like a new/reconnected account
        // (token works but no or very little archive data)
        if (!result.skipped) {
          try {
            const archiveCount = await pool.query(
              'SELECT COUNT(*)::int as cnt FROM fb_ads_archive WHERE user_id = $1',
              [userId]
            );
            const cnt = archiveCount.rows[0]?.cnt || 0;
            if (cnt < 30) {
              log.info({ userId, archiveRows: cnt }, 'New Meta connection detected — auto-backfilling 90 days');
              // Fire-and-forget backfill (deduplicates via ON CONFLICT DO NOTHING)
              backfillFacebook(userId, 90)
                .then(bf => log.info({ userId, backfilled: bf.backfilled }, 'Auto-backfill complete'))
                .catch(err => log.error({ err, userId }, 'Auto-backfill failed'));
            }
          } catch { /* ignore */ }
        }

        emitPlatformDone(userId, platform);
        return { success: !result.skipped, detail: `${result.synced} ad rows synced` };
      }

      case 'google': {
        const result = await syncGA4Data(userId);
        emitPlatformDone(userId, platform);
        return { success: result.synced > 0 || !result.error, detail: `${result.synced} GA4 rows synced` };
      }

      case 'shopify': {
        const [products, customers] = await Promise.all([
          syncShopifyProducts(userId),
          syncShopifyCustomers(userId),
        ]);
        emitPlatformDone(userId, platform);
        return {
          success: !products.skipped,
          detail: `${products.synced} products, ${customers.synced} customers`,
        };
      }

      case 'tiktok': {
        const result = await syncTikTokAds(userId);
        if (!result.skipped && result.synced > 0) {
          await evaluateRules(userId);
        }
        emitPlatformDone(userId, platform);
        return { success: !result.skipped, detail: `${result.synced} ad rows synced` };
      }

      case 'klaviyo': {
        const result = await syncAllKlaviyoData(userId);
        emitPlatformDone(userId, platform);
        return {
          success: !result.skipped,
          detail: `${result.profiles} profiles, ${result.campaigns} campaigns`,
        };
      }

      case 'checkoutChamp': {
        const result = await syncAllCCData(userId);
        emitPlatformDone(userId, platform);
        return {
          success: true,
          detail: `${result.orders} orders, ${result.purchases} purchases`,
        };
      }

      case 'newsbreak': {
        const result = await syncAllNewsBreakForUser(userId);
        if (!result.skipped && result.synced > 0) {
          await evaluateRules(userId);
        }
        emitPlatformDone(userId, platform);
        return { success: !result.skipped, detail: `${result.synced} ad rows synced across ${result.accounts} account(s)` };
      }

      default:
        return { success: false, detail: 'Unknown platform' };
    }
  } catch (err: any) {
    log.error({ userId, platform, err }, 'Platform sync error');
    getRealtime()?.emitSyncStatus(userId, {
      status: 'syncing',
      platforms: [{ platform, status: 'error' }],
    });
    return { success: false, detail: err.message || 'Sync failed' };
  }
}

function emitPlatformDone(userId: number, platform: SyncPlatform): void {
  getRealtime()?.emitSyncStatus(userId, {
    status: 'syncing',
    platforms: [{ platform, status: 'done' }],
  });
  // Also push fresh metrics
  getRealtime()?.emitMetricsUpdate(userId);
}
