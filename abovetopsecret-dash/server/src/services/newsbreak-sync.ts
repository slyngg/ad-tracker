import pool from '../db';
import https from 'https';
import { getSetting } from './settings';

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
        if (apiKey && accountId) {
          return { accessToken: apiKey, accountId: String(accountId) };
        }
      }
    } catch {
      // Fall through to getSetting
    }
  }

  // Fallback to app_settings
  const accessToken = await getSetting('newsbreak_api_key', userId);
  const accountId = await getSetting('newsbreak_account_id', userId);
  if (accessToken && accountId) {
    return { accessToken, accountId };
  }

  return null;
}

// ── HTTP helper ────────────────────────────────────────────────

function fetchNewsBreakJSON(url: string, accessToken: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = body ? JSON.stringify(body) : undefined;
    const options: https.RequestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: postData ? 'POST' : 'GET',
      headers: {
        'access_token': accessToken,
        'Accept': 'application/json',
        ...(postData ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {}),
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
    if (postData) req.write(postData);
    req.end();
  });
}

// ── Sync ───────────────────────────────────────────────────────

export async function syncNewsBreakAds(userId?: number): Promise<{ synced: number; skipped: boolean }> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) return { synced: 0, skipped: true };

  const { accessToken, accountId } = auth;
  const today = new Date().toISOString().split('T')[0];

  let synced = 0;
  let page = 1;

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    while (true) {
      const requestBody = {
        advertiser_id: accountId,
        start_date: today,
        end_date: today,
        group_by: ['ad_id'],
        page,
        page_size: 1000,
      };

      const response = await fetchNewsBreakJSON(
        'https://business.newsbreak.com/business-api/v1/reports/getIntegratedReport',
        accessToken,
        requestBody,
      );

      if (response.code !== 0 && response.code !== 200) {
        console.error(`[NewsBreak Sync] API error: ${response.message || JSON.stringify(response)}`);
        break;
      }

      const rows = response.data?.list || response.data?.rows || response.data || [];
      if (!Array.isArray(rows) || rows.length === 0) break;

      for (const row of rows) {
        try {
          const adId = row.ad_id;
          if (!adId) continue;

          const spend = parseFloat(row.spend || '0') || 0;
          const impressions = parseInt(row.impressions || '0') || 0;
          const clicks = parseInt(row.clicks || '0') || 0;
          const conversions = parseInt(row.conversions || '0') || 0;
          const conversionValue = parseFloat(row.conversion_value || row.total_conversion_value || '0') || 0;
          const ctr = parseFloat(row.ctr || '0') || 0;
          const cpc = parseFloat(row.cpc || '0') || 0;
          const cpm = parseFloat(row.cpm || '0') || 0;
          const cpa = parseFloat(row.cpa || row.cost_per_conversion || '0') || 0;
          const roas = parseFloat(row.roas || '0') || 0;

          await dbClient.query('SAVEPOINT row_insert');
          await dbClient.query(
            `INSERT INTO newsbreak_ads_today (user_id, account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, spend, impressions, clicks, conversions, conversion_value, ctr, cpc, cpm, cpa, roas, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
             ON CONFLICT (user_id, ad_id) DO UPDATE SET
               account_id = EXCLUDED.account_id, campaign_id = EXCLUDED.campaign_id,
               campaign_name = EXCLUDED.campaign_name, adset_id = EXCLUDED.adset_id,
               adset_name = EXCLUDED.adset_name, ad_name = EXCLUDED.ad_name,
               spend = EXCLUDED.spend, impressions = EXCLUDED.impressions, clicks = EXCLUDED.clicks,
               conversions = EXCLUDED.conversions, conversion_value = EXCLUDED.conversion_value,
               ctr = EXCLUDED.ctr, cpc = EXCLUDED.cpc, cpm = EXCLUDED.cpm, cpa = EXCLUDED.cpa,
               roas = EXCLUDED.roas, synced_at = NOW()`,
            [
              userId || null, accountId,
              row.campaign_id || null, row.campaign_name || null,
              row.adset_id || row.ad_group_id || null, row.adset_name || row.ad_group_name || null,
              adId, row.ad_name || null,
              spend, impressions, clicks, conversions, conversionValue,
              ctr, cpc, cpm, cpa, roas,
            ]
          );
          await dbClient.query('RELEASE SAVEPOINT row_insert');
          synced++;
        } catch (err) {
          await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
          console.error(`[NewsBreak Sync] Failed to upsert ad row:`, err);
        }
      }

      if (rows.length < 1000) break;
      page++;
    }

    await dbClient.query('COMMIT');
    console.log(`[NewsBreak Sync] Synced ${synced} ad rows${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error(`[NewsBreak Sync] Fetch failed:`, err);
  } finally {
    dbClient.release();
  }

  return { synced, skipped: false };
}
