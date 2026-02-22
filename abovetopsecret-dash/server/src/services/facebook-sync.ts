import pool from '../db';
import https from 'https';
import { getSetting } from './settings';
import { getRealtime } from './realtime';
import { decrypt } from './oauth-providers';

interface FBAction {
  action_type: string;
  value: string;
}

interface FBInsightRow {
  account_name: string;
  campaign_name: string;
  adset_name: string;
  adset_id: string;
  ad_name: string;
  spend: string;
  clicks: string;
  impressions: string;
  actions?: FBAction[];
}

interface FBAdCreative {
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  body?: string;
  title?: string;
  call_to_action_type?: string;
}

interface FBAdRow {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: string;
  creative?: FBAdCreative;
}

interface FBAdInsightRow {
  ad_id: string;
  date_start: string;
  spend: string;
  impressions: string;
  clicks: string;
  actions?: FBAction[];
  action_values?: FBAction[];
  video_p25_watched_actions?: FBAction[];
  video_p50_watched_actions?: FBAction[];
  video_p75_watched_actions?: FBAction[];
  video_p100_watched_actions?: FBAction[];
  video_play_actions?: FBAction[];
}

interface FBResponse {
  data?: any[];
  paging?: { next?: string };
}

function fetchJSON(url: string): Promise<FBResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    });
    req.setTimeout(30_000, () => req.destroy(new Error('Request timeout after 30s')));
    req.on('error', reject);
  });
}

async function fetchAllPages(initialUrl: string): Promise<FBInsightRow[]> {
  const allRows: FBInsightRow[] = [];
  let url: string | undefined = initialUrl;

  while (url) {
    const response = await fetchJSON(url);
    if (response.data) {
      allRows.push(...response.data);
    }
    url = response.paging?.next;
  }

  return allRows;
}

/**
 * Resolve Meta access token: check integration_configs for OAuth token first,
 * fall back to app_settings.
 */
async function getAccessToken(userId?: number): Promise<string | undefined> {
  if (userId) {
    try {
      const result = await pool.query(
        `SELECT credentials FROM integration_configs
         WHERE user_id = $1 AND platform = 'meta' AND status = 'connected' AND connection_method = 'oauth'`,
        [userId]
      );
      if (result.rows.length > 0) {
        const creds = result.rows[0].credentials;
        if (creds?.access_token_encrypted) {
          return decrypt(creds.access_token_encrypted);
        }
      }
    } catch {
      // Fall through to getSetting
    }
  }
  return getSetting('fb_access_token', userId);
}

export async function syncFacebook(userId?: number): Promise<{ synced: number; accounts: number; skipped: boolean }> {
  const accessToken = await getAccessToken(userId);
  const accountIds = await getSetting('fb_ad_account_ids', userId);

  if (!accessToken || !accountIds) {
    console.warn('[Meta Sync] Access token or ad account IDs not set, skipping sync');
    return { synced: 0, accounts: 0, skipped: true };
  }

  const accounts = accountIds.split(',').map((id) => id.trim()).filter(Boolean);
  let totalSynced = 0;

  for (const accountId of accounts) {
    try {
      const url = `https://graph.facebook.com/v21.0/${accountId}/insights?fields=account_name,campaign_name,adset_name,adset_id,ad_name,spend,clicks,impressions,actions&date_preset=today&level=ad&access_token=${accessToken}`;

      const rows = await fetchAllPages(url);

      const dbClient = await pool.connect();
      try {
        await dbClient.query('BEGIN');

        for (const row of rows) {
          try {
            const lpViews = row.actions?.find(
              (a) => a.action_type === 'landing_page_view'
            )?.value || '0';

            await dbClient.query('SAVEPOINT row_insert');
            await dbClient.query(
              `INSERT INTO fb_ads_today (account_name, campaign_name, ad_set_name, ad_set_id, ad_name, spend, clicks, impressions, landing_page_views, synced_at, user_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
               ON CONFLICT (user_id, ad_set_id, ad_name) DO UPDATE SET
                 spend = EXCLUDED.spend,
                 clicks = EXCLUDED.clicks,
                 impressions = EXCLUDED.impressions,
                 landing_page_views = EXCLUDED.landing_page_views,
                 synced_at = NOW()`,
              [
                row.account_name,
                row.campaign_name,
                row.adset_name,
                row.adset_id,
                row.ad_name,
                parseFloat(row.spend) || 0,
                parseInt(row.clicks) || 0,
                parseInt(row.impressions) || 0,
                parseInt(lpViews) || 0,
                userId || null,
              ]
            );
            await dbClient.query('RELEASE SAVEPOINT row_insert');
            totalSynced++;
          } catch (err) {
            await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
            console.error(`[Meta Sync] Failed to upsert ad row:`, err);
          }
        }

        await dbClient.query('COMMIT');
      } catch (err) {
        await dbClient.query('ROLLBACK');
        console.error(`[Meta Sync] Ads transaction failed for ${accountId}:`, err);
      } finally {
        dbClient.release();
      }

      console.log(`[Meta Sync] Synced ${rows.length} rows from ${accountId}`);
    } catch (err) {
      console.error(`[Meta Sync] Error syncing account ${accountId}:`, err);
    }
  }

  // Multi-account sync: iterate accounts table for per-account tokens
  if (userId) {
    try {
      const accountRows = await pool.query(
        `SELECT id, platform_account_id, access_token_encrypted
         FROM accounts
         WHERE user_id = $1 AND platform = 'meta' AND status = 'active'
           AND platform_account_id IS NOT NULL AND access_token_encrypted IS NOT NULL`,
        [userId]
      );

      for (const acct of accountRows.rows) {
        try {
          const acctToken = decrypt(acct.access_token_encrypted);
          const acctId = acct.platform_account_id;
          const url = `https://graph.facebook.com/v21.0/${acctId}/insights?fields=account_name,campaign_name,adset_name,adset_id,ad_name,spend,clicks,impressions,actions&date_preset=today&level=ad&access_token=${acctToken}`;

          const rows = await fetchAllPages(url);

          const dbClient = await pool.connect();
          try {
            await dbClient.query('BEGIN');

            for (const row of rows) {
              try {
                const lpViews = row.actions?.find(
                  (a) => a.action_type === 'landing_page_view'
                )?.value || '0';

                await dbClient.query('SAVEPOINT row_insert');
                await dbClient.query(
                  `INSERT INTO fb_ads_today (account_name, campaign_name, ad_set_name, ad_set_id, ad_name, spend, clicks, impressions, landing_page_views, synced_at, user_id, account_id)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11)
                   ON CONFLICT (user_id, ad_set_id, ad_name) DO UPDATE SET
                     spend = EXCLUDED.spend,
                     clicks = EXCLUDED.clicks,
                     impressions = EXCLUDED.impressions,
                     landing_page_views = EXCLUDED.landing_page_views,
                     synced_at = NOW(),
                     account_id = EXCLUDED.account_id`,
                  [
                    row.account_name, row.campaign_name, row.adset_name, row.adset_id, row.ad_name,
                    parseFloat(row.spend) || 0, parseInt(row.clicks) || 0, parseInt(row.impressions) || 0,
                    parseInt(lpViews) || 0, userId, acct.id,
                  ]
                );
                await dbClient.query('RELEASE SAVEPOINT row_insert');
                totalSynced++;
              } catch (err) {
                await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
                console.error(`[Meta Sync] Failed to upsert ad row for account ${acct.id}:`, err);
              }
            }

            await dbClient.query('COMMIT');
          } catch (err) {
            await dbClient.query('ROLLBACK');
            console.error(`[Meta Sync] Ads transaction failed for account ${acct.id}:`, err);
          } finally {
            dbClient.release();
          }

          console.log(`[Meta Sync] Account ${acct.id}: synced ${rows.length} rows from ${acctId}`);
        } catch (err) {
          console.error(`[Meta Sync] Error syncing account ${acct.id}:`, err);
        }
      }
    } catch (err) {
      // accounts table may not exist yet
      console.error('[Meta Sync] Error querying accounts table:', err);
    }
  }

  // Emit real-time metrics update after sync
  if (totalSynced > 0) {
    getRealtime()?.emitMetricsUpdate(userId || null);
  }

  return { synced: totalSynced, accounts: accounts.length, skipped: false };
}

// --- Creative Assets Sync ---

function mapFBStatus(status: string): string {
  const map: Record<string, string> = { ACTIVE: 'active', PAUSED: 'paused', DELETED: 'deleted', ARCHIVED: 'deleted' };
  return map[status] || 'paused';
}

function determineCreativeType(creative?: FBAdCreative): string {
  if (!creative) return 'dynamic';
  if (creative.video_id) return 'video';
  if (creative.image_url) return 'image';
  return 'dynamic';
}

function getVideoActionValue(actions?: FBAction[]): number {
  if (!actions?.length) return 0;
  const v = actions.find(a => a.action_type === 'video_view');
  return parseInt(v?.value || '0') || 0;
}

// Sync ad-level creatives from Facebook
export async function syncFacebookCreatives(userId?: number): Promise<{ synced: number; metrics: number; skipped: boolean }> {
  const accessToken = await getAccessToken(userId);
  const accountIds = await getSetting('fb_ad_account_ids', userId);

  if (!accessToken || !accountIds) {
    return { synced: 0, metrics: 0, skipped: true };
  }

  const accounts = accountIds.split(',').map((id) => id.trim()).filter(Boolean);
  let totalSynced = 0;
  let totalMetrics = 0;

  // Build adset/campaign name lookup from existing fb_ads_today
  const nameCache: Record<string, { adset_name: string; campaign_name: string }> = {};

  for (const accountId of accounts) {
    try {
      // 1. Pull ads with creative fields
      const adsUrl = `https://graph.facebook.com/v21.0/${accountId}/ads?fields=id,name,adset_id,campaign_id,status,creative{thumbnail_url,image_url,video_id,body,title,call_to_action_type}&limit=500&access_token=${accessToken}`;
      const adRows = await fetchAllPages(adsUrl) as unknown as FBAdRow[];

      // Populate name cache from fb_ads_today
      try {
        const namesResult = await pool.query(
          `SELECT DISTINCT ad_set_id, ad_set_name, campaign_name FROM fb_ads_today WHERE user_id = $1`,
          [userId || null]
        );
        for (const r of namesResult.rows) {
          nameCache[r.ad_set_id] = { adset_name: r.ad_set_name, campaign_name: r.campaign_name };
        }
      } catch { /* ignore */ }

      // Insert creatives in a transaction
      const dbClient = await pool.connect();
      try {
        await dbClient.query('BEGIN');

        for (const ad of adRows) {
          if (!ad.id) continue;
          const creative = ad.creative;
          const names = nameCache[ad.adset_id] || { adset_name: '', campaign_name: '' };
          const creativeType = determineCreativeType(creative);
          const videoUrl = creative?.video_id ? `https://www.facebook.com/ads/videos/${creative.video_id}/` : null;

          try {
            await dbClient.query('SAVEPOINT row_insert');
            await dbClient.query(
              `INSERT INTO ad_creatives (user_id, platform, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
                creative_type, thumbnail_url, image_url, video_url, ad_copy, headline, cta_type, status, last_seen)
               VALUES ($1, 'meta', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_DATE)
               ON CONFLICT (user_id, platform, ad_id) DO UPDATE SET
                 ad_name = EXCLUDED.ad_name,
                 adset_id = EXCLUDED.adset_id,
                 adset_name = COALESCE(NULLIF(EXCLUDED.adset_name, ''), ad_creatives.adset_name),
                 campaign_id = EXCLUDED.campaign_id,
                 campaign_name = COALESCE(NULLIF(EXCLUDED.campaign_name, ''), ad_creatives.campaign_name),
                 creative_type = EXCLUDED.creative_type,
                 thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, ad_creatives.thumbnail_url),
                 image_url = COALESCE(EXCLUDED.image_url, ad_creatives.image_url),
                 video_url = COALESCE(EXCLUDED.video_url, ad_creatives.video_url),
                 ad_copy = COALESCE(EXCLUDED.ad_copy, ad_creatives.ad_copy),
                 headline = COALESCE(EXCLUDED.headline, ad_creatives.headline),
                 cta_type = COALESCE(EXCLUDED.cta_type, ad_creatives.cta_type),
                 status = EXCLUDED.status,
                 last_seen = CURRENT_DATE`,
              [
                userId || null, ad.id, ad.name, ad.adset_id, names.adset_name,
                ad.campaign_id, names.campaign_name, creativeType,
                creative?.thumbnail_url || null, creative?.image_url || null, videoUrl,
                creative?.body || null, creative?.title || null,
                creative?.call_to_action_type || null, mapFBStatus(ad.status),
              ]
            );
            await dbClient.query('RELEASE SAVEPOINT row_insert');
            totalSynced++;
          } catch (err) {
            await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
            console.error(`[Creative Sync] Failed to upsert creative ${ad.id}:`, err);
          }
        }

        await dbClient.query('COMMIT');
      } catch (err) {
        await dbClient.query('ROLLBACK');
        console.error(`[Creative Sync] Creatives transaction failed for ${accountId}:`, err);
      } finally {
        dbClient.release();
      }

      // 2. Pull ad-level daily insights
      const today = new Date().toISOString().split('T')[0];
      const insightsUrl = `https://graph.facebook.com/v21.0/${accountId}/insights?level=ad&fields=ad_id,spend,impressions,clicks,actions,action_values,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,video_play_actions&time_range={"since":"${today}","until":"${today}"}&time_increment=1&limit=500&access_token=${accessToken}`;

      let insightRows: FBAdInsightRow[];
      try {
        insightRows = await fetchAllPages(insightsUrl) as unknown as FBAdInsightRow[];
      } catch (err) {
        console.warn(`[Creative Sync] Could not fetch ad-level insights for ${accountId} — may need ads_read permission:`, err);
        continue;
      }

      // Insert metrics in a transaction
      const metricsClient = await pool.connect();
      try {
        await metricsClient.query('BEGIN');

        for (const row of insightRows) {
          if (!row.ad_id) continue;

          // Look up creative_id
          const creativeResult = await metricsClient.query(
            `SELECT id FROM ad_creatives WHERE user_id = $1 AND platform = 'meta' AND ad_id = $2`,
            [userId || null, row.ad_id]
          );
          if (creativeResult.rows.length === 0) continue;
          const creativeId = creativeResult.rows[0].id;

          const spend = parseFloat(row.spend) || 0;
          const impressions = parseInt(row.impressions) || 0;
          const clicks = parseInt(row.clicks) || 0;
          const purchases = parseInt(row.actions?.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase')?.value || '0') || 0;
          const addToCarts = parseInt(row.actions?.find(a => a.action_type === 'add_to_cart')?.value || '0') || 0;
          const revenue = parseFloat(row.action_values?.find(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase')?.value || '0') || 0;
          const videoPlays = getVideoActionValue(row.video_play_actions);
          const vw25 = getVideoActionValue(row.video_p25_watched_actions);
          const vw50 = getVideoActionValue(row.video_p50_watched_actions);
          const vw75 = getVideoActionValue(row.video_p75_watched_actions);
          const vw100 = getVideoActionValue(row.video_p100_watched_actions);

          const ctr = impressions > 0 ? clicks / impressions : 0;
          const cpc = clicks > 0 ? spend / clicks : 0;
          const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
          const cpa = purchases > 0 ? spend / purchases : 0;
          const roas = spend > 0 ? revenue / spend : 0;
          const cvr = clicks > 0 ? purchases / clicks : 0;
          const thumbStopRate = impressions > 0 ? videoPlays / impressions : 0;

          try {
            await metricsClient.query('SAVEPOINT row_insert');
            await metricsClient.query(
              `INSERT INTO creative_metrics_daily
                (creative_id, date, spend, impressions, clicks, purchases, revenue, add_to_carts,
                 video_views, video_watches_25, video_watches_50, video_watches_75, video_watches_100,
                 thumb_stop_rate, ctr, cpc, cpm, cpa, roas, cvr, synced_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
               ON CONFLICT (creative_id, date) DO UPDATE SET
                 spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
                 purchases = EXCLUDED.purchases, revenue = EXCLUDED.revenue, add_to_carts = EXCLUDED.add_to_carts,
                 video_views = EXCLUDED.video_views, video_watches_25 = EXCLUDED.video_watches_25,
                 video_watches_50 = EXCLUDED.video_watches_50, video_watches_75 = EXCLUDED.video_watches_75,
                 video_watches_100 = EXCLUDED.video_watches_100, thumb_stop_rate = EXCLUDED.thumb_stop_rate,
                 ctr = EXCLUDED.ctr, cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, cpa = EXCLUDED.cpa,
                 roas = EXCLUDED.roas, cvr = EXCLUDED.cvr, synced_at = NOW()`,
              [
                creativeId, today, spend, impressions, clicks, purchases, revenue, addToCarts,
                videoPlays, vw25, vw50, vw75, vw100, thumbStopRate, ctr, cpc, cpm, cpa, roas, cvr,
              ]
            );
            await metricsClient.query('RELEASE SAVEPOINT row_insert');
            totalMetrics++;
          } catch (err) {
            await metricsClient.query('ROLLBACK TO SAVEPOINT row_insert');
            console.error(`[Creative Sync] Failed to upsert metric for ad ${row.ad_id}:`, err);
          }
        }

        await metricsClient.query('COMMIT');
      } catch (err) {
        await metricsClient.query('ROLLBACK');
        console.error(`[Creative Sync] Metrics transaction failed for ${accountId}:`, err);
      } finally {
        metricsClient.release();
      }

      console.log(`[Creative Sync] Synced ${adRows.length} creatives, ${insightRows.length} metric rows from ${accountId}`);
    } catch (err) {
      console.error(`[Creative Sync] Error syncing creatives for account ${accountId}:`, err);
    }
  }

  return { synced: totalSynced, metrics: totalMetrics, skipped: false };
}
