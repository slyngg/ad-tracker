import https from 'https';
import pool from '../db';
import { getSetting } from './settings';
import { decrypt } from './oauth-providers';

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

// ── Auth resolution ────────────────────────────────────────────

async function getTikTokAuth(userId: number): Promise<{ accessToken: string; advertiserId: string } | null> {
  try {
    const result = await pool.query(
      `SELECT credentials, config FROM integration_configs
       WHERE user_id = $1 AND platform = 'tiktok' AND status = 'connected'`,
      [userId]
    );
    if (result.rows.length > 0) {
      const { credentials, config } = result.rows[0];
      if (credentials?.access_token_encrypted) {
        const advertiserId = config?.advertiser_id || credentials?.advertiser_id;
        if (advertiserId) {
          return {
            accessToken: decrypt(credentials.access_token_encrypted),
            advertiserId: String(advertiserId),
          };
        }
      }
    }
  } catch {
    // Fall through to getSetting
  }

  const accessToken = await getSetting('tiktok_access_token', userId);
  const advertiserId = await getSetting('tiktok_advertiser_id', userId);
  if (accessToken && advertiserId) {
    return { accessToken, advertiserId };
  }

  return null;
}

// ── HTTP helper ────────────────────────────────────────────────

function tiktokPost(endpoint: string, body: any, accessToken: string): Promise<any> {
  const url = new URL(`${TIKTOK_API_BASE}${endpoint}`);
  const bodyStr = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Access-Token': accessToken,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.code !== 0) {
              reject(new Error(parsed.message || `TikTok API error code ${parsed.code}`));
            } else {
              resolve(parsed.data || parsed);
            }
          } catch {
            reject(new Error(`TikTok API returned invalid JSON: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function tiktokGet(endpoint: string, params: Record<string, string>, accessToken: string): Promise<any> {
  const url = new URL(`${TIKTOK_API_BASE}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'Access-Token': accessToken,
          Accept: 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.code !== 0) {
              reject(new Error(parsed.message || `TikTok API error code ${parsed.code}`));
            } else {
              resolve(parsed.data || parsed);
            }
          } catch {
            reject(new Error(`TikTok API returned invalid JSON: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Campaign Management ────────────────────────────────────────

export async function updateTikTokAdGroupStatus(
  adGroupId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<any> {
  const auth = await getTikTokAuth(userId);
  if (!auth) throw new Error('No TikTok credentials configured');

  return tiktokPost('/adgroup/status/update/', {
    advertiser_id: auth.advertiserId,
    adgroup_ids: [adGroupId],
    opt_status: status,
  }, auth.accessToken);
}

export async function pauseTikTokAdGroup(adGroupId: string, userId: number): Promise<any> {
  return updateTikTokAdGroupStatus(adGroupId, 'DISABLE', userId);
}

export async function enableTikTokAdGroup(adGroupId: string, userId: number): Promise<any> {
  return updateTikTokAdGroupStatus(adGroupId, 'ENABLE', userId);
}

export async function adjustTikTokBudget(
  adGroupId: string,
  dailyBudget: number,
  userId: number
): Promise<any> {
  const auth = await getTikTokAuth(userId);
  if (!auth) throw new Error('No TikTok credentials configured');

  if (dailyBudget < 20) {
    throw new Error('TikTok minimum daily budget is $20');
  }

  return tiktokPost('/adgroup/update/', {
    advertiser_id: auth.advertiserId,
    adgroup_id: adGroupId,
    budget: dailyBudget,
  }, auth.accessToken);
}

export async function getTikTokAdGroupBudget(
  adGroupId: string,
  userId: number
): Promise<number> {
  const auth = await getTikTokAuth(userId);
  if (!auth) throw new Error('No TikTok credentials configured');

  const result = await tiktokGet('/adgroup/get/', {
    advertiser_id: auth.advertiserId,
    filtering: JSON.stringify({ adgroup_ids: [adGroupId] }),
    fields: JSON.stringify(['budget']),
  }, auth.accessToken);

  const adGroup = result?.list?.[0];
  if (!adGroup) throw new Error(`TikTok ad group ${adGroupId} not found`);
  return parseFloat(adGroup.budget) || 0;
}

export async function increaseTikTokBudget(
  adGroupId: string,
  percent: number,
  userId: number
): Promise<any> {
  const currentBudget = await getTikTokAdGroupBudget(adGroupId, userId);
  const newBudget = Math.max(20, Math.round(currentBudget * (1 + percent / 100) * 100) / 100);
  return adjustTikTokBudget(adGroupId, newBudget, userId);
}

export async function decreaseTikTokBudget(
  adGroupId: string,
  percent: number,
  userId: number
): Promise<any> {
  const currentBudget = await getTikTokAdGroupBudget(adGroupId, userId);
  const newBudget = Math.max(20, Math.round(currentBudget * (1 - percent / 100) * 100) / 100);
  return adjustTikTokBudget(adGroupId, newBudget, userId);
}

export async function updateTikTokCampaignStatus(
  campaignId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<any> {
  const auth = await getTikTokAuth(userId);
  if (!auth) throw new Error('No TikTok credentials configured');

  return tiktokPost('/campaign/status/update/', {
    advertiser_id: auth.advertiserId,
    campaign_ids: [campaignId],
    opt_status: status,
  }, auth.accessToken);
}
