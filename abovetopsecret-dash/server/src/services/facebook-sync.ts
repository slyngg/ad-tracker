import pool from '../db';
import https from 'https';
import { getSetting } from './settings';

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

interface FBResponse {
  data?: FBInsightRow[];
  paging?: { next?: string };
}

function fetchJSON(url: string): Promise<FBResponse> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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
    }).on('error', reject);
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

export async function syncFacebook(userId?: number): Promise<{ synced: number; accounts: number; skipped: boolean }> {
  const accessToken = await getSetting('fb_access_token', userId);
  const accountIds = await getSetting('fb_ad_account_ids', userId);

  if (!accessToken || !accountIds) {
    console.warn('[FB Sync] FB_ACCESS_TOKEN or FB_AD_ACCOUNT_IDS not set, skipping sync');
    return { synced: 0, accounts: 0, skipped: true };
  }

  const accounts = accountIds.split(',').map((id) => id.trim()).filter(Boolean);
  let totalSynced = 0;

  for (const accountId of accounts) {
    try {
      const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=account_name,campaign_name,adset_name,adset_id,ad_name,spend,clicks,impressions,actions&date_preset=today&level=ad&access_token=${accessToken}`;

      const rows = await fetchAllPages(url);

      for (const row of rows) {
        const lpViews = row.actions?.find(
          (a) => a.action_type === 'landing_page_view'
        )?.value || '0';

        await pool.query(
          `INSERT INTO fb_ads_today (account_name, campaign_name, ad_set_name, ad_set_id, ad_name, spend, clicks, impressions, landing_page_views, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (ad_set_id, ad_name) DO UPDATE SET
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
          ]
        );
        totalSynced++;
      }

      console.log(`[FB Sync] Synced ${rows.length} rows from ${accountId}`);
    } catch (err) {
      console.error(`[FB Sync] Error syncing account ${accountId}:`, err);
    }
  }

  return { synced: totalSynced, accounts: accounts.length, skipped: false };
}
