import https from 'https';
import pool from '../db';
import { getSetting } from './settings';

const NB_HOST = 'business.newsbreak.com';

// ── Types ─────────────────────────────────────────────────────

export interface NewsBreakAuth {
  accessToken: string;
  accountId: string;
  dbAccountId?: number;
}

// ── Auth resolution ────────────────────────────────────────────

export async function getNewsBreakAuth(userId: number): Promise<NewsBreakAuth | null> {
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

  const accessToken = await getSetting('newsbreak_api_key', userId);
  const accountId = await getSetting('newsbreak_account_id', userId);
  if (accessToken) {
    return { accessToken, accountId: accountId || 'default' };
  }

  return null;
}

export async function getAllNewsBreakAuth(userId: number): Promise<NewsBreakAuth[]> {
  const auths: NewsBreakAuth[] = [];

  // From integration_configs
  try {
    const result = await pool.query(
      `SELECT id, credentials, config FROM integration_configs
       WHERE user_id = $1 AND platform = 'newsbreak' AND status = 'connected'`,
      [userId]
    );
    for (const row of result.rows) {
      const apiKey = row.credentials?.api_key;
      const accountId = row.config?.account_id || row.credentials?.account_id;
      if (apiKey) {
        auths.push({ accessToken: apiKey, accountId: String(accountId || 'default'), dbAccountId: row.id });
      }
    }
  } catch { /* ignore */ }

  // From app_settings (legacy)
  if (auths.length === 0) {
    const accessToken = await getSetting('newsbreak_api_key', userId);
    const accountId = await getSetting('newsbreak_account_id', userId);
    if (accessToken) {
      auths.push({ accessToken, accountId: accountId || 'default' });
    }
  }

  return auths;
}

// ── HTTP helper ────────────────────────────────────────────────

function newsbreakRequest(method: string, path: string, accessToken: string, body?: any): Promise<any> {
  const bodyStr = body ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: NB_HOST,
      path,
      method,
      headers: {
        'Access-Token': accessToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(bodyStr ? { 'Content-Length': String(Buffer.byteLength(bodyStr)) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const code = parsed.code;
          // code=0 or code='0' means success; undefined/null code with 2xx status is also success
          if (code != null && code !== 0 && code !== '0') {
            reject(new Error(parsed.errMsg || parsed.message || `NewsBreak API error (code ${code})`));
          } else if (code == null && res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.errMsg || parsed.message || `NewsBreak API HTTP ${res.statusCode}`));
          } else {
            resolve(parsed.data ?? parsed);
          }
        } catch (e) {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`NewsBreak API HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          } else {
            reject(new Error(`Failed to parse NewsBreak response: ${data.slice(0, 200)}`));
          }
        }
      });
      res.on('error', reject);
    });

    req.setTimeout(30_000, () => req.destroy(new Error('Request timeout after 30s')));
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Campaign management ────────────────────────────────────────

export async function createNewsBreakCampaign(
  accountId: string,
  params: { campaign_name: string; objective: string; daily_budget?: number },
  accessToken: string
): Promise<{ campaign_id: string }> {
  const data = await newsbreakRequest('POST', '/business-api/v1/campaign/createCampaign', accessToken, {
    advertiser_id: accountId,
    campaign_name: params.campaign_name,
    objective: params.objective,
    budget_mode: 'BUDGET_MODE_DAY',
    budget: params.daily_budget || 50,
  });
  return { campaign_id: String(data.campaign_id) };
}

export async function createNewsBreakAdSet(
  accountId: string,
  params: {
    campaign_id: string;
    adset_name: string;
    budget: number;
    budget_mode: string;
    schedule_start_time?: string;
    schedule_end_time?: string;
    targeting?: Record<string, any>;
  },
  accessToken: string
): Promise<{ adset_id: string }> {
  // Extract special fields from targeting so they go as top-level API params
  const targeting = { ...(params.targeting || {}) };
  const placements = targeting.placements;
  const eventType = targeting.event_type;
  const optimizationGoal = targeting.optimization_goal;
  const bidAmount = targeting.bid_amount;
  // Remove them from targeting so they don't get double-sent
  delete targeting.placements;
  delete targeting.event_type;
  delete targeting.optimization_goal;
  delete targeting.bid_amount;

  const body: Record<string, any> = {
    advertiser_id: accountId,
    campaign_id: params.campaign_id,
    adset_name: params.adset_name,
    budget: params.budget,
    budget_mode: params.budget_mode,
    schedule_type: params.schedule_end_time ? 'SCHEDULE_START_END' : 'SCHEDULE_FROM_NOW',
    schedule_start_time: params.schedule_start_time || undefined,
    schedule_end_time: params.schedule_end_time || undefined,
    targeting,
  };

  // Placements as top-level field (NewsBreak API expects placement_type or placements)
  if (placements && Array.isArray(placements) && placements.length > 0 && !placements.includes('ALL')) {
    body.placement_type = placements;
  }

  // Optimization & conversion event
  if (optimizationGoal) body.optimization_goal = optimizationGoal;
  if (eventType) body.conversion_event = eventType;
  if (bidAmount) body.bid_amount = bidAmount;

  const data = await newsbreakRequest('POST', '/business-api/v1/adSet/createAdSet', accessToken, body);
  return { adset_id: String(data.adset_id) };
}

export async function createNewsBreakAd(
  accountId: string,
  params: {
    adset_id: string;
    ad_name: string;
    ad_text: string;
    headline?: string;
    image_url?: string;
    video_url?: string;
    thumbnail_url?: string;
    landing_page_url?: string;
    call_to_action?: string;
    brand_name?: string;
    button_text?: string;
  },
  accessToken: string
): Promise<{ ad_id: string }> {
  const body: Record<string, any> = {
    advertiser_id: accountId,
    adset_id: params.adset_id,
    ad_name: params.ad_name,
    ad_text: params.ad_text,
    headline: params.headline,
    landing_page_url: params.landing_page_url,
    call_to_action: params.button_text || params.call_to_action || 'LEARN_MORE',
  };
  if (params.video_url) {
    body.video_url = params.video_url;
    if (params.thumbnail_url) body.thumbnail_url = params.thumbnail_url;
  } else if (params.image_url) {
    body.image_url = params.image_url;
  }
  if (params.brand_name) body.brand_name = params.brand_name;
  const data = await newsbreakRequest('POST', '/business-api/v1/ad/createAd', accessToken, body);
  return { ad_id: String(data.ad_id) };
}

// ── Status management ──────────────────────────────────────────

export async function updateNewsBreakCampaignStatus(
  campaignId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  await newsbreakRequest('POST', '/business-api/v1/campaign/updateCampaignStatus', auth.accessToken, {
    advertiser_id: auth.accountId,
    campaign_id: campaignId,
    status,
  });
}

export async function updateNewsBreakAdSetStatus(
  adSetId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  await newsbreakRequest('POST', '/business-api/v1/adSet/updateAdSetStatus', auth.accessToken, {
    advertiser_id: auth.accountId,
    adset_id: adSetId,
    status,
  });
}

export async function updateNewsBreakAdStatus(
  adId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  await newsbreakRequest('POST', '/business-api/v1/ad/updateAdStatus', auth.accessToken, {
    advertiser_id: auth.accountId,
    ad_id: adId,
    status,
  });
}

// ── Budget management ──────────────────────────────────────────

export async function adjustNewsBreakBudget(
  adSetId: string,
  budgetDollars: number,
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  if (budgetDollars < 5) throw new Error('NewsBreak minimum daily budget is $5.00');
  await newsbreakRequest('POST', '/business-api/v1/adSet/updateAdSet', auth.accessToken, {
    advertiser_id: auth.accountId,
    adset_id: adSetId,
    budget: budgetDollars,
  });
}

export async function getNewsBreakAdSetBudgets(
  campaignId: string,
  userId: number
): Promise<{ adset_id: string; budget: number; budget_mode: string; status: string }[]> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) return [];
  try {
    const data = await newsbreakRequest('POST', '/business-api/v1/adSet/getAdSetList', auth.accessToken, {
      advertiser_id: auth.accountId,
      campaign_id: campaignId,
    });
    const list = data?.list || data?.adsets || (Array.isArray(data) ? data : []);
    return list.map((as: any) => ({
      adset_id: String(as.adset_id || as.id),
      budget: (as.budget || 0),
      budget_mode: as.budget_mode || 'BUDGET_MODE_DAY',
      status: as.status || as.opt_status || 'UNKNOWN',
    }));
  } catch (err) {
    return [];
  }
}

// ── List / Get helpers (for duplication) ───────────────────────

export async function getNewsBreakCampaignList(
  accountId: string,
  accessToken: string
): Promise<any[]> {
  const data = await newsbreakRequest('POST', '/business-api/v1/campaign/getCampaignList', accessToken, {
    advertiser_id: accountId,
  });
  return data?.list || data?.campaigns || (Array.isArray(data) ? data : []);
}

export async function getNewsBreakAdSetList(
  accountId: string,
  campaignId: string,
  accessToken: string
): Promise<any[]> {
  const data = await newsbreakRequest('POST', '/business-api/v1/adSet/getAdSetList', accessToken, {
    advertiser_id: accountId,
    campaign_id: campaignId,
  });
  return data?.list || data?.adsets || (Array.isArray(data) ? data : []);
}

export async function getNewsBreakAdList(
  accountId: string,
  adSetId: string,
  accessToken: string
): Promise<any[]> {
  const data = await newsbreakRequest('POST', '/business-api/v1/ad/getAdList', accessToken, {
    advertiser_id: accountId,
    adset_id: adSetId,
  });
  return data?.list || data?.ads || (Array.isArray(data) ? data : []);
}

// ── Backward-compat aliases ────────────────────────────────────
// These are used by other files that still reference the old names
export const createNewsBreakAdGroup = createNewsBreakAdSet;
export const updateNewsBreakAdGroupStatus = updateNewsBreakAdSetStatus;
export const getNewsBreakAdGroupBudgets = getNewsBreakAdSetBudgets;
