/**
 * Impression Sync Service
 *
 * Syncs impression data from ad platform tables (fb_ads_today, tiktok_ads_today,
 * newsbreak_ads_today) into the unified pixel_impressions table. Also pulls
 * from archive tables for historical data.
 *
 * This transforms existing platform data — no new API calls are needed.
 */

import pool from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('ImpressionSync');

// ── Types ───────────────────────────────────────────────────────

interface SyncResult {
  platform: string;
  upserted: number;
}

// ── Platform sync functions ─────────────────────────────────────

/**
 * Sync Meta (Facebook) impressions from fb_ads_today and fb_ads_archive.
 * fb_ads_today has: campaign_id, campaign_name, ad_set_id, ad_set_name, impressions.
 * fb_ads_archive stores the full row as JSONB in ad_data.
 */
async function syncMetaImpressions(userId: number): Promise<number> {
  // Today's data — aggregate by campaign level
  const todayResult = await pool.query(
    `INSERT INTO pixel_impressions (user_id, platform, campaign_id, campaign_name, adset_id, ad_id, impressions, reach, frequency, date)
     SELECT
       $1,
       'meta',
       campaign_id,
       campaign_name,
       ad_set_id,
       'all',
       COALESCE(SUM(impressions), 0),
       0,
       0,
       CURRENT_DATE
     FROM fb_ads_today
     WHERE user_id = $1
       AND impressions > 0
     GROUP BY campaign_id, campaign_name, ad_set_id
     ON CONFLICT (user_id, platform, campaign_id, adset_id, ad_id, date)
     DO UPDATE SET
       impressions = EXCLUDED.impressions,
       campaign_name = EXCLUDED.campaign_name,
       created_at = NOW()
     RETURNING id`,
    [userId],
  );

  // Archive data — pull from archived JSONB rows for historical impression data
  const archiveResult = await pool.query(
    `INSERT INTO pixel_impressions (user_id, platform, campaign_id, campaign_name, adset_id, ad_id, impressions, reach, frequency, date)
     SELECT
       $1,
       'meta',
       ad_data->>'campaign_id',
       ad_data->>'campaign_name',
       ad_data->>'ad_set_id',
       'all',
       COALESCE(SUM((ad_data->>'impressions')::int), 0),
       0,
       0,
       archived_date
     FROM fb_ads_archive
     WHERE user_id = $1
       AND (ad_data->>'impressions')::int > 0
       AND archived_date >= CURRENT_DATE - INTERVAL '90 days'
     GROUP BY ad_data->>'campaign_id', ad_data->>'campaign_name', ad_data->>'ad_set_id', archived_date
     ON CONFLICT (user_id, platform, campaign_id, adset_id, ad_id, date)
     DO NOTHING
     RETURNING id`,
    [userId],
  );

  return (todayResult.rowCount ?? 0) + (archiveResult.rowCount ?? 0);
}

/**
 * Sync TikTok impressions from tiktok_ads_today and tiktok_ads_archive.
 * tiktok_ads_today has: campaign_id, campaign_name, adgroup_id, ad_id, impressions.
 */
async function syncTikTokImpressions(userId: number): Promise<number> {
  const todayResult = await pool.query(
    `INSERT INTO pixel_impressions (user_id, platform, campaign_id, campaign_name, adset_id, ad_id, impressions, reach, frequency, date)
     SELECT
       $1,
       'tiktok',
       campaign_id,
       campaign_name,
       adgroup_id,
       'all',
       COALESCE(SUM(impressions), 0),
       0,
       0,
       CURRENT_DATE
     FROM tiktok_ads_today
     WHERE user_id = $1
       AND impressions > 0
     GROUP BY campaign_id, campaign_name, adgroup_id
     ON CONFLICT (user_id, platform, campaign_id, adset_id, ad_id, date)
     DO UPDATE SET
       impressions = EXCLUDED.impressions,
       campaign_name = EXCLUDED.campaign_name,
       created_at = NOW()
     RETURNING id`,
    [userId],
  );

  const archiveResult = await pool.query(
    `INSERT INTO pixel_impressions (user_id, platform, campaign_id, campaign_name, adset_id, ad_id, impressions, reach, frequency, date)
     SELECT
       $1,
       'tiktok',
       ad_data->>'campaign_id',
       ad_data->>'campaign_name',
       ad_data->>'adgroup_id',
       'all',
       COALESCE(SUM((ad_data->>'impressions')::int), 0),
       0,
       0,
       archived_date
     FROM tiktok_ads_archive
     WHERE user_id = $1
       AND (ad_data->>'impressions')::int > 0
       AND archived_date >= CURRENT_DATE - INTERVAL '90 days'
     GROUP BY ad_data->>'campaign_id', ad_data->>'campaign_name', ad_data->>'adgroup_id', archived_date
     ON CONFLICT (user_id, platform, campaign_id, adset_id, ad_id, date)
     DO NOTHING
     RETURNING id`,
    [userId],
  );

  return (todayResult.rowCount ?? 0) + (archiveResult.rowCount ?? 0);
}

/**
 * Sync NewsBreak impressions from newsbreak_ads_today and newsbreak_ads_archive.
 * newsbreak_ads_today has: campaign_id, campaign_name, adset_id, ad_id, impressions.
 */
async function syncNewsBreakImpressions(userId: number): Promise<number> {
  const todayResult = await pool.query(
    `INSERT INTO pixel_impressions (user_id, platform, campaign_id, campaign_name, adset_id, ad_id, impressions, reach, frequency, date)
     SELECT
       $1,
       'newsbreak',
       campaign_id,
       campaign_name,
       adset_id,
       'all',
       COALESCE(SUM(impressions), 0),
       0,
       0,
       CURRENT_DATE
     FROM newsbreak_ads_today
     WHERE user_id = $1
       AND impressions > 0
     GROUP BY campaign_id, campaign_name, adset_id
     ON CONFLICT (user_id, platform, campaign_id, adset_id, ad_id, date)
     DO UPDATE SET
       impressions = EXCLUDED.impressions,
       campaign_name = EXCLUDED.campaign_name,
       created_at = NOW()
     RETURNING id`,
    [userId],
  );

  const archiveResult = await pool.query(
    `INSERT INTO pixel_impressions (user_id, platform, campaign_id, campaign_name, adset_id, ad_id, impressions, reach, frequency, date)
     SELECT
       $1,
       'newsbreak',
       ad_data->>'campaign_id',
       ad_data->>'campaign_name',
       ad_data->>'adset_id',
       'all',
       COALESCE(SUM((ad_data->>'impressions')::int), 0),
       0,
       0,
       archived_date
     FROM newsbreak_ads_archive
     WHERE user_id = $1
       AND (ad_data->>'impressions')::int > 0
       AND archived_date >= CURRENT_DATE - INTERVAL '90 days'
     GROUP BY ad_data->>'campaign_id', ad_data->>'campaign_name', ad_data->>'adset_id', archived_date
     ON CONFLICT (user_id, platform, campaign_id, adset_id, ad_id, date)
     DO NOTHING
     RETURNING id`,
    [userId],
  );

  return (todayResult.rowCount ?? 0) + (archiveResult.rowCount ?? 0);
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Sync impressions from all ad platforms for a single user.
 * Aggregates daily impressions from the respective ads tables and
 * upserts into pixel_impressions.
 */
export async function syncImpressions(userId: number): Promise<{
  results: SyncResult[];
  totalUpserted: number;
}> {
  log.info({ userId }, 'Starting impression sync');

  const results: SyncResult[] = [];
  let totalUpserted = 0;

  // Meta
  try {
    const count = await syncMetaImpressions(userId);
    results.push({ platform: 'meta', upserted: count });
    totalUpserted += count;
    if (count > 0) log.info({ userId, count }, 'Meta impressions synced');
  } catch (err) {
    log.error({ userId, err }, 'Failed to sync Meta impressions');
    results.push({ platform: 'meta', upserted: 0 });
  }

  // TikTok
  try {
    const count = await syncTikTokImpressions(userId);
    results.push({ platform: 'tiktok', upserted: count });
    totalUpserted += count;
    if (count > 0) log.info({ userId, count }, 'TikTok impressions synced');
  } catch (err) {
    log.error({ userId, err }, 'Failed to sync TikTok impressions');
    results.push({ platform: 'tiktok', upserted: 0 });
  }

  // NewsBreak
  try {
    const count = await syncNewsBreakImpressions(userId);
    results.push({ platform: 'newsbreak', upserted: count });
    totalUpserted += count;
    if (count > 0) log.info({ userId, count }, 'NewsBreak impressions synced');
  } catch (err) {
    log.error({ userId, err }, 'Failed to sync NewsBreak impressions');
    results.push({ platform: 'newsbreak', upserted: 0 });
  }

  log.info({ userId, totalUpserted }, 'Impression sync complete');
  return { results, totalUpserted };
}

/**
 * Sync impressions for all users. Called from the scheduler daily at 2 AM.
 */
export async function syncImpressionsForAllUsers(): Promise<{
  usersProcessed: number;
  totalUpserted: number;
}> {
  const usersResult = await pool.query('SELECT DISTINCT id FROM users');
  const userIds: number[] = usersResult.rows.map((r) => r.id);

  let usersProcessed = 0;
  let totalUpserted = 0;

  for (const userId of userIds) {
    try {
      const result = await syncImpressions(userId);
      totalUpserted += result.totalUpserted;
      if (result.totalUpserted > 0) usersProcessed++;
    } catch (err) {
      log.error({ userId, err }, 'Impression sync failed for user');
    }
  }

  log.info({ usersProcessed, totalUpserted }, 'Impression sync complete for all users');
  return { usersProcessed, totalUpserted };
}
