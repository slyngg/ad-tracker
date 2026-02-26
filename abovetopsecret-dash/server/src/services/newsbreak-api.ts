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
          if (parsed.code !== 0) {
            reject(new Error(parsed.errMsg || `NewsBreak API error (code ${parsed.code})`));
          } else {
            resolve(parsed.data);
          }
        } catch (e) {
          reject(new Error(`Failed to parse NewsBreak response: ${data.slice(0, 200)}`));
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
  const data = await newsbreakRequest('POST', '/business-api/v1/campaigns/create', accessToken, {
    advertiser_id: accountId,
    campaign_name: params.campaign_name,
    objective: params.objective,
    budget_mode: 'BUDGET_MODE_DAY',
    budget: params.daily_budget || 50,
  });
  return { campaign_id: String(data.campaign_id) };
}

export async function createNewsBreakAdGroup(
  accountId: string,
  params: {
    campaign_id: string;
    adgroup_name: string;
    budget: number;
    budget_mode: string;
    schedule_start_time?: string;
    schedule_end_time?: string;
    targeting?: Record<string, any>;
  },
  accessToken: string
): Promise<{ adgroup_id: string }> {
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
    adgroup_name: params.adgroup_name,
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

  const data = await newsbreakRequest('POST', '/business-api/v1/adgroups/create', accessToken, body);
  return { adgroup_id: String(data.adgroup_id) };
}

export async function createNewsBreakAd(
  accountId: string,
  params: {
    adgroup_id: string;
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
    adgroup_id: params.adgroup_id,
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
  const data = await newsbreakRequest('POST', '/business-api/v1/ads/create', accessToken, body);
  return { ad_id: String(data.ad_id) };
}

export async function updateNewsBreakCampaignStatus(
  campaignId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  await newsbreakRequest('POST', '/business-api/v1/campaigns/update/status', auth.accessToken, {
    advertiser_id: auth.accountId,
    campaign_id: campaignId,
    status,
  });
}

export async function updateNewsBreakAdGroupStatus(
  adGroupId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  await newsbreakRequest('POST', '/business-api/v1/adgroups/update/status', auth.accessToken, {
    advertiser_id: auth.accountId,
    adgroup_id: adGroupId,
    status,
  });
}

export async function adjustNewsBreakBudget(
  adGroupId: string,
  budgetDollars: number,
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  if (budgetDollars < 5) throw new Error('NewsBreak minimum daily budget is $5.00');
  await newsbreakRequest('POST', '/business-api/v1/adgroups/update', auth.accessToken, {
    advertiser_id: auth.accountId,
    adgroup_id: adGroupId,
    budget: budgetDollars,
  });
}
