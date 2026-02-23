import pool from '../db';
import https from 'https';
import { getSetting } from './settings';
import { createLogger } from '../lib/logger';

const log = createLogger('NewsBreakSync');

// ── Auth resolution ────────────────────────────────────────────

async function getNewsBreakAuth(userId?: number): Promise<{ accessToken: string; accountId: string } | null> {
  // Check integration_configs first (encrypted credentials)
  if (userId) {
    try {
      const result = await pool.query(
        `SELECT credentials, config FROM integration_configs
         WHERE user_id = $1 AND platform = 'newsbreak' AND status = 'connected'`,
        [userId]
      );
      if (result.rows.length > 0) {
        const { credentials, config } = result.rows[0];
        const apiKey = credentials?.api_key;
        const accountId = config?.account_id || credentials?.account_id;
        if (apiKey) {
          return { accessToken: apiKey, accountId: String(accountId || 'default') };
        }
      }
    } catch {
      // Fall through to getSetting
    }
  }

  // Fallback to app_settings
  const accessToken = await getSetting('newsbreak_api_key', userId);
  const accountId = await getSetting('newsbreak_account_id', userId);
  if (accessToken) {
    return { accessToken, accountId: accountId || 'default' };
  }

  return null;
}

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

export async function syncNewsBreakAds(userId?: number): Promise<{ synced: number; skipped: boolean }> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) return { synced: 0, skipped: true };

  const { accessToken, accountId } = auth;
  const today = new Date().toISOString().split('T')[0];

  // Fetch ad-level report with campaign and ad set dimensions
  const requestBody = {
    name: `sync_${today}`,
    dateRange: 'FIXED',
    startDate: today,
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
        // CPC/CPM/CPA are in cents
        const cpc = (parseFloat(row.cpcDecimal) || row.cpc || 0) / 100;
        const cpm = (parseFloat(row.cpmDecimal) || row.cpm || 0) / 100;
        const cpa = row.cpaDecimal > 0 ? (parseFloat(row.cpaDecimal) || 0) / 100 : 0;
        const roas = parseFloat(row.roas) || 0;

        await dbClient.query('SAVEPOINT row_insert');
        await dbClient.query(
          `INSERT INTO newsbreak_ads_today (user_id, account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend, impressions, clicks, conversions, conversion_value, ctr, cpc, cpm, cpa, roas, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
           ON CONFLICT (COALESCE(user_id, -1), ad_id) DO UPDATE SET
             account_id = EXCLUDED.account_id, campaign_id = EXCLUDED.campaign_id,
             campaign_name = EXCLUDED.campaign_name, adset_id = EXCLUDED.adset_id,
             adset_name = EXCLUDED.adset_name, ad_name = EXCLUDED.ad_name,
             spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
             conversions = EXCLUDED.conversions, conversion_value = EXCLUDED.conversion_value,
             ctr = EXCLUDED.ctr, cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, cpa = EXCLUDED.cpa,
             roas = EXCLUDED.roas, synced_at = NOW()`,
          [
            userId || null, accountId,
            row.campaignId || null, row.campaign || null,
            row.adSetId || null, row.adSet || null,
            adId, row.ad || null,
            spend, impressions, clicks, conversions, conversionValue,
            ctr, cpc, cpm, cpa, roas,
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
  } catch (err) {
    await dbClient.query('ROLLBACK');
    log.error({ err }, 'Fetch failed');
  } finally {
    dbClient.release();
  }

  return { synced, skipped: false };
}
