import pool from '../db';
import https from 'https';
import { getSetting } from './settings';

interface FBInsightRow {
  account_name: string;
  campaign_name: string;
  adset_name: string;
  adset_id: string;
  ad_name: string;
  spend: string;
  clicks: string;
  impressions: string;
}

function fetchJSON(url: string): Promise<{ data?: FBInsightRow[] }> {
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

export async function syncFacebook(): Promise<{ synced: number; accounts: number; skipped: boolean }> {
  const accessToken = await getSetting('fb_access_token');
  const accountIds = await getSetting('fb_ad_account_ids');

  if (!accessToken || !accountIds) {
    console.warn('[FB Sync] FB_ACCESS_TOKEN or FB_AD_ACCOUNT_IDS not set, skipping sync');
    return { synced: 0, accounts: 0, skipped: true };
  }

  const accounts = accountIds.split(',').map((id) => id.trim()).filter(Boolean);
  let totalSynced = 0;

  for (const accountId of accounts) {
    try {
      const url = `https://graph.facebook.com/v19.0/${accountId}/insights?fields=account_name,campaign_name,adset_name,adset_id,ad_name,spend,clicks,impressions&date_preset=today&level=ad&access_token=${accessToken}`;

      const response = await fetchJSON(url);
      const rows = response.data || [];

      for (const row of rows) {
        await pool.query(
          `INSERT INTO fb_ads_today (account_name, campaign_name, ad_set_name, ad_set_id, ad_name, spend, clicks, impressions, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (ad_set_id, ad_name) DO UPDATE SET
             spend = EXCLUDED.spend,
             clicks = EXCLUDED.clicks,
             impressions = EXCLUDED.impressions,
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
