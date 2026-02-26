import pool from '../db';
import https from 'https';
import { getAllNewsBreakAuth, getNewsBreakAuth, NewsBreakAuth } from './newsbreak-api';
import { createLogger } from '../lib/logger';

const log = createLogger('NewsBreakSync');

// ── HTTP helper ────────────────────────────────────────────────

function fetchNewsBreakJSON(accessToken: string, body: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options: https.RequestOptions = {
      hostname: 'business.newsbreak.com',
      path: '/business-api/v1/reports/getIntegratedReport',
      method: 'POST',
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
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
    req.write(postData);
    req.end();
  });
}

// ── Sync ───────────────────────────────────────────────────────

/**
 * Sync all NewsBreak accounts for a user (multi-account aware).
 * Called by the scheduler instead of syncNewsBreakAds directly.
 */
export async function syncAllNewsBreakForUser(userId: number): Promise<{ synced: number; skipped: boolean; accounts: number }> {
  const allAuth = await getAllNewsBreakAuth(userId);
  if (allAuth.length === 0) return { synced: 0, skipped: true, accounts: 0 };

  let totalSynced = 0;
  for (const auth of allAuth) {
    const result = await syncNewsBreakAds(userId, auth);
    totalSynced += result.synced;
  }

  return { synced: totalSynced, skipped: false, accounts: allAuth.length };
}

export async function syncNewsBreakAds(userId?: number, authOverride?: NewsBreakAuth): Promise<{ synced: number; skipped: boolean }> {
  const auth = authOverride || (userId ? await getNewsBreakAuth(userId) : null);
  if (!auth) return { synced: 0, skipped: true };

  const { accessToken, accountId } = auth;

  // Auto-create accounts row if missing (so accounts summary + other pages work)
  // Skip if this auth already came from the accounts table (has dbAccountId)
  if (userId && accountId && accountId !== 'default' && !auth.dbAccountId) {
    try {
      const existing = await pool.query(
        `SELECT id FROM accounts WHERE user_id = $1 AND platform = 'newsbreak' AND platform_account_id = $2`,
        [userId, accountId]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO accounts (user_id, name, platform, platform_account_id, currency, timezone, color, status)
           VALUES ($1, 'NewsBreak', 'newsbreak', $2, 'USD', 'America/New_York', '#e11d48', 'active')`,
          [userId, accountId]
        );
        log.info({ userId, accountId }, 'Auto-created NewsBreak account row');
      }
    } catch { /* ignore — duplicate or constraint error */ }
  }

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // NewsBreak API often has a reporting lag — today's data may not be ready.
  // Pull yesterday + today to ensure we always have the most recent data.
  const requestBody = {
    name: `sync_${today}`,
    dateRange: 'FIXED',
    startDate: yesterday,
    endDate: today,
    dimensions: ['CAMPAIGN', 'AD_SET', 'AD'],
    metrics: ['COST'],
  };

  let synced = 0;
  const dbClient = await pool.connect();
  try {
    const response = await fetchNewsBreakJSON(accessToken, requestBody);

    if (response.code !== 0) {
      log.error({ code: response.code, errMsg: response.errMsg }, 'API error');
      return { synced: 0, skipped: false };
    }

    const rows = response.data?.rows || [];
    if (!Array.isArray(rows) || rows.length === 0) {
      log.info('No ad data returned');
      return { synced: 0, skipped: false };
    }

    await dbClient.query('BEGIN');

    for (const row of rows) {
      try {
        const adId = row.adId;
        if (!adId) continue;

        // API returns monetary values in cents — convert to dollars
        const spend = (parseFloat(row.costDecimal) || row.cost || 0) / 100;
        const impressions = parseInt(row.impression) || 0;
        const clicks = parseInt(row.click) || 0;
        const conversions = parseInt(row.conversion) || 0;
        const conversionValue = (parseFloat(row.conversionValueDecimal) || row.conversionValue || 0) / 100;

        // CTR/CVR are in per-10000 format — convert to raw ratio
        const ctr = (parseInt(row.ctr) || 0) / 10000;
        const cvr = (parseInt(row.cvr) || 0) / 10000;
        // CPC/CPM/CPA are in cents
        const cpc = (parseFloat(row.cpcDecimal) || row.cpc || 0) / 100;
        const cpm = (parseFloat(row.cpmDecimal) || row.cpm || 0) / 100;
        const cpa = row.cpaDecimal > 0 ? (parseFloat(row.cpaDecimal) || 0) / 100 : 0;
        const roas = parseFloat(row.roas) || 0;

        await dbClient.query('SAVEPOINT row_insert');
        await dbClient.query(
          `INSERT INTO newsbreak_ads_today (user_id, account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend, impressions, clicks, conversions, conversion_value, ctr, cpc, cpm, cpa, roas, cvr, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
           ON CONFLICT (COALESCE(user_id, -1), ad_id) DO UPDATE SET
             account_id = EXCLUDED.account_id, campaign_id = EXCLUDED.campaign_id,
             campaign_name = EXCLUDED.campaign_name, adset_id = EXCLUDED.adset_id,
             adset_name = EXCLUDED.adset_name, ad_name = EXCLUDED.ad_name,
             spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
             conversions = EXCLUDED.conversions, conversion_value = EXCLUDED.conversion_value,
             ctr = EXCLUDED.ctr, cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, cpa = EXCLUDED.cpa,
             roas = EXCLUDED.roas, cvr = EXCLUDED.cvr, synced_at = NOW()`,
          [
            userId || null, accountId,
            row.campaignId || null, row.campaign || null,
            row.adSetId || null, row.adSet || null,
            adId, row.ad || null,
            spend, impressions, clicks, conversions, conversionValue,
            ctr, cpc, cpm, cpa, roas, cvr,
          ]
        );
        await dbClient.query('RELEASE SAVEPOINT row_insert');
        synced++;
      } catch (err) {
        await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
        log.error({ err }, 'Failed to upsert ad row');
      }
    }

    await dbClient.query('COMMIT');
    log.info({ synced, userId }, `Synced ${synced} ad rows`);

    // Ingest creatives into ad_creatives + creative_metrics_daily
    if (userId) {
      await ingestNewsBreakCreatives(userId, rows);
    }
  } catch (err) {
    await dbClient.query('ROLLBACK');
    log.error({ err }, 'Fetch failed');
  } finally {
    dbClient.release();
  }

  return { synced, skipped: false };
}

// ── Creative ingestion ────────────────────────────────────────

async function ingestNewsBreakCreatives(userId: number, rows: any[]): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  for (const row of rows) {
    const adId = row.adId;
    if (!adId) continue;

    const spend = (parseFloat(row.costDecimal) || row.cost || 0) / 100;
    const impressions = parseInt(row.impression) || 0;
    const clicks = parseInt(row.click) || 0;
    const conversions = parseInt(row.conversion) || 0;
    const conversionValue = (parseFloat(row.conversionValueDecimal) || row.conversionValue || 0) / 100;

    try {
      // Upsert into ad_creatives
      const creativeRes = await pool.query(
        `INSERT INTO ad_creatives (user_id, platform, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
          creative_type, status, last_seen)
         VALUES ($1, 'newsbreak', $2, $3, $4, $5, $6, $7, 'image', 'active', CURRENT_DATE)
         ON CONFLICT (user_id, platform, ad_id) DO UPDATE SET
           ad_name = COALESCE(NULLIF(EXCLUDED.ad_name, ''), ad_creatives.ad_name),
           adset_id = EXCLUDED.adset_id,
           adset_name = COALESCE(NULLIF(EXCLUDED.adset_name, ''), ad_creatives.adset_name),
           campaign_id = EXCLUDED.campaign_id,
           campaign_name = COALESCE(NULLIF(EXCLUDED.campaign_name, ''), ad_creatives.campaign_name),
           status = 'active',
           last_seen = CURRENT_DATE
         RETURNING id`,
        [userId, adId, row.ad || null, row.adSetId || null, row.adSet || null, row.campaignId || null, row.campaign || null]
      );

      const creativeId = creativeRes.rows[0]?.id;
      if (!creativeId) continue;

      // Upsert daily metrics
      await pool.query(
        `INSERT INTO creative_metrics_daily (creative_id, date, spend, impressions, clicks, purchases, revenue)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (creative_id, date) DO UPDATE SET
           spend = EXCLUDED.spend,
           impressions = EXCLUDED.impressions,
           clicks = EXCLUDED.clicks,
           purchases = EXCLUDED.purchases,
           revenue = EXCLUDED.revenue`,
        [creativeId, today, spend, impressions, clicks, conversions, conversionValue]
      );
    } catch (err) {
      log.error({ err, adId }, 'Failed to ingest NewsBreak creative');
    }
  }
}

// ── Historical backfill ───────────────────────────────────────

/**
 * Backfill all NewsBreak accounts for a user.
 */
export async function backfillAllNewsBreakForUser(userId: number, days = 90): Promise<{ backfilled: number; days: number; accounts: number }> {
  const allAuth = await getAllNewsBreakAuth(userId);
  if (allAuth.length === 0) return { backfilled: 0, days: 0, accounts: 0 };

  let totalBackfilled = 0;
  for (const auth of allAuth) {
    const result = await backfillNewsBreak(userId, days, auth);
    totalBackfilled += result.backfilled;
  }

  return { backfilled: totalBackfilled, days, accounts: allAuth.length };
}

export async function backfillNewsBreak(userId?: number, days = 90, authOverride?: NewsBreakAuth): Promise<{ backfilled: number; days: number }> {
  const auth = authOverride || (userId ? await getNewsBreakAuth(userId) : null);
  if (!auth) return { backfilled: 0, days: 0 };

  const { accessToken, accountId } = auth;
  let backfilled = 0;

  for (let d = days; d >= 1; d--) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split('T')[0];

    try {
      const response = await fetchNewsBreakJSON(accessToken, {
        name: `backfill_${date}`,
        dateRange: 'FIXED',
        startDate: date,
        endDate: date,
        dimensions: ['CAMPAIGN', 'AD_SET', 'AD'],
        metrics: ['COST'],
      });

      if (response.code !== 0) {
        log.warn({ code: response.code, errMsg: response.errMsg, date }, 'API error during backfill');
        continue;
      }

      const rows = response.data?.rows || [];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      for (const row of rows) {
        const adId = row.adId;
        if (!adId) continue;

        // Same cents→dollars transformation as syncNewsBreakAds
        const spend = (parseFloat(row.costDecimal) || row.cost || 0) / 100;
        const impressions = parseInt(row.impression) || 0;
        const clicks = parseInt(row.click) || 0;
        const conversions = parseInt(row.conversion) || 0;
        const conversionValue = (parseFloat(row.conversionValueDecimal) || row.conversionValue || 0) / 100;
        const ctr = (parseInt(row.ctr) || 0) / 10000;
        const cvr = (parseInt(row.cvr) || 0) / 10000;
        const cpc = (parseFloat(row.cpcDecimal) || row.cpc || 0) / 100;
        const cpm = (parseFloat(row.cpmDecimal) || row.cpm || 0) / 100;
        const cpa = row.cpaDecimal > 0 ? (parseFloat(row.cpaDecimal) || 0) / 100 : 0;
        const roas = parseFloat(row.roas) || 0;

        const adData = {
          ad_id: adId,
          ad_name: row.ad || null,
          campaign_id: row.campaignId || null,
          campaign_name: row.campaign || null,
          adset_id: row.adSetId || null,
          adset_name: row.adSet || null,
          account_id: accountId,
          spend, impressions, clicks, conversions, conversion_value: conversionValue,
          ctr, cpc, cpm, cpa, roas, cvr,
        };

        try {
          await pool.query(
            `INSERT INTO newsbreak_ads_archive (archived_date, ad_data, user_id, account_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [date, JSON.stringify(adData), userId || null, accountId]
          );
          backfilled++;
        } catch (err) {
          log.error({ err, date, adId }, 'Failed to insert archive row during backfill');
        }
      }

      log.info({ date, rows: rows.length }, 'Backfilled day');
    } catch (err) {
      log.error({ err, date }, 'Backfill fetch failed for day');
    }

    // 2s delay between API calls to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  log.info({ backfilled, days, userId }, 'Backfill complete');
  return { backfilled, days };
}
