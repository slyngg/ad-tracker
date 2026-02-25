import https from 'https';
import pool from '../db';
import { getSetting } from './settings';
import { decrypt } from './oauth-providers';

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

// ── Auth resolution ────────────────────────────────────────────

export async function getTikTokAuth(userId: number): Promise<{ accessToken: string; advertiserId: string } | null> {
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

// ── Campaign Creation ─────────────────────────────────────────

export async function createTikTokCampaign(
  advertiserId: string,
  params: { campaign_name: string; objective_type: string; budget?: number; budget_mode?: string },
  accessToken: string
): Promise<{ campaign_id: string }> {
  const body: any = {
    advertiser_id: advertiserId,
    campaign_name: params.campaign_name,
    objective_type: params.objective_type,
    budget_mode: params.budget_mode || 'BUDGET_MODE_INFINITE',
  };
  if (params.budget) {
    body.budget = params.budget;
  }
  const result = await tiktokPost('/campaign/create/', body, accessToken);
  return { campaign_id: result.campaign_id };
}

export async function createTikTokAdGroup(
  advertiserId: string,
  params: {
    campaign_id: string;
    adgroup_name: string;
    placement_type?: string;
    budget: number;
    budget_mode: string;
    schedule_type: string;
    schedule_start_time?: string;
    schedule_end_time?: string;
    optimization_goal: string;
    bid_type?: string;
    billing_event?: string;
    location_ids?: number[];
    gender?: string;
    age_groups?: string[];
    operating_systems?: string[];
  },
  accessToken: string
): Promise<{ adgroup_id: string }> {
  const body: any = {
    advertiser_id: advertiserId,
    campaign_id: params.campaign_id,
    adgroup_name: params.adgroup_name,
    placement_type: params.placement_type || 'PLACEMENT_TYPE_AUTOMATIC',
    budget: params.budget,
    budget_mode: params.budget_mode,
    schedule_type: params.schedule_type,
    optimization_goal: params.optimization_goal,
    bid_type: params.bid_type || 'BID_TYPE_NO_BID',
    billing_event: params.billing_event || 'OCPM',
  };
  if (params.schedule_start_time) body.schedule_start_time = params.schedule_start_time;
  if (params.schedule_end_time) body.schedule_end_time = params.schedule_end_time;
  if (params.location_ids?.length) body.location_ids = params.location_ids;
  if (params.gender) body.gender = params.gender;
  if (params.age_groups?.length) body.age_groups = params.age_groups;
  if (params.operating_systems?.length) body.operating_systems = params.operating_systems;

  const result = await tiktokPost('/adgroup/create/', body, accessToken);
  return { adgroup_id: result.adgroup_id };
}

export async function uploadTikTokImage(
  advertiserId: string,
  imageUrl: string,
  accessToken: string
): Promise<{ image_id: string }> {
  const result = await tiktokPost('/file/image/ad/upload/', {
    advertiser_id: advertiserId,
    upload_type: 'UPLOAD_BY_URL',
    image_url: imageUrl,
  }, accessToken);
  return { image_id: result.image_id };
}

export async function createTikTokAd(
  advertiserId: string,
  params: {
    adgroup_id: string;
    ad_name: string;
    ad_text?: string;
    image_ids?: string[];
    video_id?: string;
    call_to_action?: string;
    landing_page_url?: string;
  },
  accessToken: string
): Promise<{ ad_id: string }> {
  const body: any = {
    advertiser_id: advertiserId,
    adgroup_id: params.adgroup_id,
    ad_name: params.ad_name,
    ad_format: params.video_id ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE',
  };
  if (params.ad_text) body.ad_text = params.ad_text;
  if (params.image_ids?.length) body.image_ids = params.image_ids;
  if (params.video_id) body.video_id = params.video_id;
  if (params.call_to_action) body.call_to_action = params.call_to_action;
  if (params.landing_page_url) body.landing_page_url = params.landing_page_url;

  const result = await tiktokPost('/ad/create/', body, accessToken);
  return { ad_id: result.ad_id };
}
