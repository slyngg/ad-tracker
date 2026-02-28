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
 * Iterates over every NB account in the accounts table and syncs each
 * with its own advertiser_id so data is properly separated.
 */
export async function syncAllNewsBreakForUser(userId: number): Promise<{ synced: number; skipped: boolean; accounts: number }> {
  // Get API credentials (one key accesses all advertiser accounts)
  const auth = await getNewsBreakAuth(userId);
  if (!auth) return { synced: 0, skipped: true, accounts: 0 };

  // NB reports API ignores advertiser_id — returns ALL campaigns regardless.
  // So we sync once and then apply the campaign→account mapping from nb_campaign_account_map.
  const result = await syncNewsBreakAds(userId, auth);

  // Auto-discover campaign→advertiser mapping from user's NB account entries
  await discoverCampaignAccountMapping(userId, auth.accessToken);

  // Apply campaign→account mapping so account_id reflects user's assignment
  if (userId) {
    await applyCampaignAccountMap(userId);
  }

  return { synced: result.synced, skipped: false, accounts: 1 };
}

/**
 * Auto-map any unmapped campaigns to NB accounts using campaign name matching.
 * NB reports API doesn't distinguish campaigns by advertiser, so we match by account name keywords.
 * Already-mapped campaigns are never overridden — only new/unmapped ones get auto-assigned.
 */
async function discoverCampaignAccountMapping(userId: number, _accessToken: string): Promise<void> {
  try {
    // Get all NB accounts for this user
    const acctRes = await pool.query(
      `SELECT id, name, platform_account_id FROM accounts
       WHERE user_id = $1 AND platform = 'newsbreak' AND status = 'active'
         AND platform_account_id IS NOT NULL AND platform_account_id != 'default'
       ORDER BY id`,
      [userId]
    );
    if (acctRes.rows.length < 2) return; // need ≥2 accounts to map between

    // Get unmapped campaigns
    const unmappedRes = await pool.query(
      `SELECT DISTINCT n.campaign_id, n.campaign_name
       FROM newsbreak_ads_today n
       WHERE n.user_id = $1
         AND n.campaign_id NOT IN (SELECT campaign_id FROM nb_campaign_account_map WHERE user_id = $1)`,
      [userId]
    );
    if (unmappedRes.rows.length === 0) return;

    // Build keyword→account mapping from account names
    // e.g. account "NewsBreak Slot Trick" → keywords ["slot", "trick"]
    const keywordMap: { accountId: number; keywords: string[] }[] = [];
    for (const acct of acctRes.rows) {
      // Extract meaningful words from account name (skip generic words)
      const words = (acct.name || '').toLowerCase().split(/[\s\-_]+/)
        .filter((w: string) => w.length > 2 && !['news', 'break', 'newsbreak', 'account', 'acct', 'acc'].includes(w));
      if (words.length > 0) {
        keywordMap.push({ accountId: acct.id, keywords: words });
      }
    }
    if (keywordMap.length === 0) return;

    let autoMapped = 0;
    const defaultAccount = acctRes.rows[0].id; // fallback to first account

    for (const { campaign_id, campaign_name } of unmappedRes.rows) {
      const nameLower = (campaign_name || '').toLowerCase();

      // Find best matching account by keyword overlap
      let bestMatch = defaultAccount;
      let bestScore = 0;
      for (const { accountId, keywords } of keywordMap) {
        const score = keywords.filter(kw => nameLower.includes(kw)).length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = accountId;
        }
      }

      try {
        await pool.query(
          `INSERT INTO nb_campaign_account_map (user_id, campaign_id, account_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, campaign_id) DO NOTHING`,
          [userId, campaign_id, bestMatch]
        );
        autoMapped++;
      } catch { /* ignore duplicates */ }
    }

    if (autoMapped > 0) {
      log.info({ userId, autoMapped }, 'Auto-mapped unmapped campaigns by name keywords');
    }
  } catch (err) {
    log.error({ err }, 'Failed to auto-map campaign accounts');
  }
}

/**
 * Apply the nb_campaign_account_map to newsbreak_ads_today:
 * For each mapped campaign, update its rows to use the mapped account's platform_account_id.
 */
async function applyCampaignAccountMap(userId: number): Promise<void> {
  try {
    const mapRes = await pool.query(
      `SELECT m.campaign_id, a.platform_account_id
       FROM nb_campaign_account_map m
       JOIN accounts a ON a.id = m.account_id
       WHERE m.user_id = $1`,
      [userId]
    );
    if (mapRes.rows.length === 0) return;

    for (const { campaign_id, platform_account_id } of mapRes.rows) {
      await pool.query(
        `UPDATE newsbreak_ads_today SET account_id = $1 WHERE user_id = $2 AND campaign_id = $3`,
        [platform_account_id, userId, campaign_id]
      );
    }
    log.info({ userId, mappings: mapRes.rows.length }, 'Applied campaign→account mappings');
  } catch (err) {
    log.error({ err }, 'Failed to apply campaign→account map');
  }
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
  const requestBody: Record<string, any> = {
    name: `sync_${today}`,
    dateRange: 'FIXED',
    startDate: yesterday,
    endDate: today,
    dimensions: ['CAMPAIGN', 'AD_SET', 'AD'],
    metrics: ['COST'],
  };
  // Pass advertiser_id so the API returns data for this specific account
  if (accountId && accountId !== 'default') {
    requestBody.advertiser_id = accountId;
  }

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

    // Log all available fields from the first row so we can discover new API fields
    if (rows[0]) {
      log.info({ rowKeys: Object.keys(rows[0]), sampleAdvertiserId: rows[0].advertiserId, sampleAccountId: rows[0].accountId }, 'NB API row structure');
    }

    // Collect distinct advertiser IDs from the response for auto-account creation
    const seenAdvertiserIds = new Set<string>();

    await dbClient.query('BEGIN');

    for (const row of rows) {
      try {
        const adId = row.adId;
        if (!adId) continue;

        // Use per-row advertiserId if the API provides it, otherwise fall back to auth accountId
        const rowAccountId = row.advertiserId ? String(row.advertiserId) : accountId;
        if (row.advertiserId) seenAdvertiserIds.add(String(row.advertiserId));

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
          `INSERT INTO newsbreak_ads_today (user_id, account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend, impressions, clicks, conversions, conversion_value, ctr, cpc, cpm, cpa, roas, cvr, synced_at, campaign_status, adset_daily_budget)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), $20, $21)
           ON CONFLICT (COALESCE(user_id, -1), ad_id) DO UPDATE SET
             account_id = EXCLUDED.account_id, campaign_id = EXCLUDED.campaign_id,
             campaign_name = EXCLUDED.campaign_name, adset_id = EXCLUDED.adset_id,
             adset_name = EXCLUDED.adset_name, ad_name = EXCLUDED.ad_name,
             spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
             conversions = EXCLUDED.conversions, conversion_value = EXCLUDED.conversion_value,
             ctr = EXCLUDED.ctr, cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, cpa = EXCLUDED.cpa,
             roas = EXCLUDED.roas, cvr = EXCLUDED.cvr,
             campaign_status = COALESCE(EXCLUDED.campaign_status, newsbreak_ads_today.campaign_status),
             adset_daily_budget = COALESCE(EXCLUDED.adset_daily_budget, newsbreak_ads_today.adset_daily_budget),
             synced_at = NOW()`,
          [
            userId || null, rowAccountId,
            row.campaignId || null, row.campaign || null,
            row.adSetId || null, row.adSet || null,
            adId, row.ad || null,
            spend, impressions, clicks, conversions, conversionValue,
            ctr, cpc, cpm, cpa, roas, cvr,
            row.campaignStatus || null,
            row.dailyBudget ? parseFloat(row.dailyBudget) / 100 : null,
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
    log.info({ synced, userId, discoveredAdvertiserIds: [...seenAdvertiserIds] }, `Synced ${synced} ad rows`);

    // Auto-create account rows for any newly discovered advertiser IDs
    if (userId && seenAdvertiserIds.size > 0) {
      for (const advId of seenAdvertiserIds) {
        try {
          const existing = await pool.query(
            `SELECT id FROM accounts WHERE user_id = $1 AND platform = 'newsbreak' AND platform_account_id = $2`,
            [userId, advId]
          );
          if (existing.rows.length === 0) {
            await pool.query(
              `INSERT INTO accounts (user_id, name, platform, platform_account_id, currency, timezone, color, status)
               VALUES ($1, $2, 'newsbreak', $3, 'USD', 'America/New_York', '#e11d48', 'active')`,
              [userId, `NewsBreak ${advId.slice(-6)}`, advId]
            );
            log.info({ userId, advertiserId: advId }, 'Auto-created NewsBreak account from API advertiserId');
          }
        } catch { /* ignore duplicate */ }
      }
    }

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

  // Build campaign_id → accounts.id lookup from newsbreak_ads_today + nb_campaign_account_map
  const acctLookup: Record<string, number> = {};
  try {
    const mapRes = await pool.query(
      `SELECT DISTINCT nb.campaign_id, a.id as account_id
       FROM newsbreak_ads_today nb
       JOIN accounts a ON a.platform_account_id = nb.account_id AND a.user_id = nb.user_id AND a.status = 'active'
       WHERE nb.user_id = $1
       UNION
       SELECT m.campaign_id, m.account_id
       FROM nb_campaign_account_map m
       WHERE m.user_id = $1`,
      [userId]
    );
    for (const r of mapRes.rows) {
      acctLookup[r.campaign_id] = r.account_id;
    }
  } catch { /* ignore */ }

  for (const row of rows) {
    const adId = row.adId;
    if (!adId) continue;

    const spend = (parseFloat(row.costDecimal) || row.cost || 0) / 100;
    const impressions = parseInt(row.impression) || 0;
    const clicks = parseInt(row.click) || 0;
    const conversions = parseInt(row.conversion) || 0;
    const conversionValue = (parseFloat(row.conversionValueDecimal) || row.conversionValue || 0) / 100;
    const campaignId = row.campaignId || null;
    const accountId = campaignId ? acctLookup[campaignId] || null : null;

    try {
      // Upsert into ad_creatives
      const creativeRes = await pool.query(
        `INSERT INTO ad_creatives (user_id, platform, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name,
          creative_type, status, last_seen, account_id)
         VALUES ($1, 'newsbreak', $2, $3, $4, $5, $6, $7, 'image', 'active', CURRENT_DATE, $8)
         ON CONFLICT (user_id, platform, ad_id) DO UPDATE SET
           ad_name = COALESCE(NULLIF(EXCLUDED.ad_name, ''), ad_creatives.ad_name),
           adset_id = EXCLUDED.adset_id,
           adset_name = COALESCE(NULLIF(EXCLUDED.adset_name, ''), ad_creatives.adset_name),
           campaign_id = EXCLUDED.campaign_id,
           campaign_name = COALESCE(NULLIF(EXCLUDED.campaign_name, ''), ad_creatives.campaign_name),
           status = 'active',
           last_seen = CURRENT_DATE,
           account_id = COALESCE(EXCLUDED.account_id, ad_creatives.account_id)
         RETURNING id`,
        [userId, adId, row.ad || null, row.adSetId || null, row.adSet || null, campaignId, row.campaign || null, accountId]
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
