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
  // 1. Check integration_configs (OAuth-style connections)
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
    // Fall through
  }

  // 2. Check accounts table (multi-account connections page)
  try {
    const result = await pool.query(
      `SELECT id, access_token_encrypted, platform_account_id FROM accounts
       WHERE user_id = $1 AND platform = 'newsbreak' AND status = 'active' AND access_token_encrypted IS NOT NULL
       ORDER BY id LIMIT 1`,
      [userId]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return { accessToken: row.access_token_encrypted, accountId: row.platform_account_id || 'default', dbAccountId: row.id };
    }
  } catch {
    // Fall through
  }

  // 3. Fallback to app_settings (legacy global key)
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

  // From accounts table (multi-account connections page)
  try {
    const result = await pool.query(
      `SELECT id, access_token_encrypted, platform_account_id FROM accounts
       WHERE user_id = $1 AND platform = 'newsbreak' AND status = 'active' AND access_token_encrypted IS NOT NULL
       ORDER BY id`,
      [userId]
    );
    for (const row of result.rows) {
      auths.push({ accessToken: row.access_token_encrypted, accountId: row.platform_account_id || 'default', dbAccountId: row.id });
    }
  } catch { /* ignore */ }

  // From app_settings (legacy) — only if nothing else found
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
  const data = await newsbreakRequest('POST', '/business-api/v1/campaign/create', accessToken, {
    adAccountId: accountId,
    name: params.campaign_name,
    objective: params.objective,
  });
  return { campaign_id: String(data.id || data.campaign_id) };
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
  const audienceList = targeting.audience_list;
  // Remove them from targeting so they don't get double-sent
  delete targeting.placements;
  delete targeting.event_type;
  delete targeting.optimization_goal;
  delete targeting.bid_amount;
  delete targeting.audience_list;

  const body: Record<string, any> = {
    campaignId: params.campaign_id,
    name: params.adset_name,
    budget: params.budget,
    budgetType: params.budget_mode === 'BUDGET_MODE_DAY' ? 'DAILY' : (params.budget_mode || 'DAILY'),
    startTime: params.schedule_start_time ? Math.floor(new Date(params.schedule_start_time).getTime() / 1000) : Math.floor(Date.now() / 1000),
    endTime: params.schedule_end_time ? Math.floor(new Date(params.schedule_end_time).getTime() / 1000) : 2147483647,
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

  // Audience targeting
  if (audienceList) body.audience_id = audienceList;

  const data = await newsbreakRequest('POST', '/business-api/v1/ad-set/create', accessToken, body);
  return { adset_id: String(data.id || data.adset_id) };
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
  const creative: Record<string, any> = {
    type: params.video_url ? 'VIDEO' : 'IMAGE',
    headline: params.headline || params.ad_name,
    description: params.ad_text,
    callToAction: params.button_text || params.call_to_action || 'LEARN_MORE',
    clickThroughUrl: params.landing_page_url,
  };
  if (params.video_url) {
    creative.assetUrl = params.video_url;
    if (params.thumbnail_url) creative.coverUrl = params.thumbnail_url;
  } else if (params.image_url) {
    creative.assetUrl = params.image_url;
  }
  if (params.brand_name) creative.brandName = params.brand_name;

  const body: Record<string, any> = {
    adSetId: params.adset_id,
    name: params.ad_name,
    creative,
  };
  const data = await newsbreakRequest('POST', '/business-api/v1/ad/create', accessToken, body);
  return { ad_id: String(data.id || data.ad_id) };
}

// ── Status management ──────────────────────────────────────────

export async function updateNewsBreakCampaignStatus(
  campaignId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  const apiStatus = status === 'ENABLE' ? 'ON' : 'OFF';
  await newsbreakRequest('PUT', `/business-api/v1/campaign/updateStatus/${campaignId}`, auth.accessToken, {
    status: apiStatus,
  });
}

export async function updateNewsBreakAdSetStatus(
  adSetId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  const apiStatus = status === 'ENABLE' ? 'ON' : 'OFF';
  await newsbreakRequest('PUT', `/business-api/v1/ad-set/updateStatus/${adSetId}`, auth.accessToken, {
    status: apiStatus,
  });
}

export async function updateNewsBreakAdStatus(
  adId: string,
  status: 'ENABLE' | 'DISABLE',
  userId: number
): Promise<void> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  const apiStatus = status === 'ENABLE' ? 'ON' : 'OFF';
  await newsbreakRequest('PUT', `/business-api/v1/ad/updateStatus/${adId}`, auth.accessToken, {
    status: apiStatus,
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
  // NB API expects budget in cents
  await newsbreakRequest('PUT', `/business-api/v1/ad-set/update/${adSetId}`, auth.accessToken, {
    budget: Math.round(budgetDollars * 100),
  });
}

export async function getNewsBreakAdSetBudgets(
  campaignId: string,
  userId: number
): Promise<{ adset_id: string; budget: number; budget_mode: string; status: string }[]> {
  const auth = await getNewsBreakAuth(userId);
  if (!auth) return [];
  try {
    const qs = `adAccountId=${encodeURIComponent(auth.accountId)}&campaignIds=${encodeURIComponent(campaignId)}&pageNo=1&pageSize=500`;
    const data = await newsbreakRequest('GET', `/business-api/v1/ad-set/getList?${qs}`, auth.accessToken);
    const list = data?.rows || data?.list || (Array.isArray(data) ? data : []);
    return list.map((as: any) => ({
      adset_id: String(as.id || as.adset_id),
      budget: (as.budget || 0),
      budget_mode: as.budgetType || 'DAILY',
      status: as.status || 'UNKNOWN',
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
  const qs = `adAccountId=${encodeURIComponent(accountId)}&pageNo=1&pageSize=500`;
  const data = await newsbreakRequest('GET', `/business-api/v1/campaign/getList?${qs}`, accessToken);
  return data?.rows || data?.list || (Array.isArray(data) ? data : []);
}

export async function getNewsBreakAdSetList(
  accountId: string,
  campaignId: string,
  accessToken: string
): Promise<any[]> {
  const qs = `adAccountId=${encodeURIComponent(accountId)}&campaignIds=${encodeURIComponent(campaignId)}&pageNo=1&pageSize=500`;
  const data = await newsbreakRequest('GET', `/business-api/v1/ad-set/getList?${qs}`, accessToken);
  return data?.rows || data?.list || (Array.isArray(data) ? data : []);
}

export async function getNewsBreakAdList(
  accountId: string,
  adSetId: string,
  accessToken: string
): Promise<any[]> {
  const qs = `adAccountId=${encodeURIComponent(accountId)}&adSetIds=${encodeURIComponent(adSetId)}&pageNo=1&pageSize=500`;
  const data = await newsbreakRequest('GET', `/business-api/v1/ad/getList?${qs}`, accessToken);
  return data?.rows || data?.list || (Array.isArray(data) ? data : []);
}

// ── Audience management (DMP) ──────────────────────────────────

export interface NewsBreakAudience {
  audience_id: string;
  audience_name: string;
  audience_type: string; // CUSTOM, LOOKALIKE
  status: string;
  size?: number;
  source_audience_id?: string;
  created_at?: string;
}

export async function getNewsBreakAudiences(
  userId: number,
  accountId?: string
): Promise<NewsBreakAudience[]> {
  const auth = accountId
    ? (await getAllNewsBreakAuth(userId)).find(a => a.accountId === accountId) || await getNewsBreakAuth(userId)
    : await getNewsBreakAuth(userId);
  if (!auth) return [];
  try {
    const data = await newsbreakRequest('POST', '/business-api/v1/dmp/customAudience/list', auth.accessToken, {
      advertiser_id: auth.accountId,
    });
    const list = data?.list || data?.audiences || (Array.isArray(data) ? data : []);
    return list.map((a: any) => ({
      audience_id: String(a.audience_id || a.custom_audience_id || a.id),
      audience_name: a.audience_name || a.name || 'Unnamed',
      audience_type: a.audience_type || a.type || 'CUSTOM',
      status: a.status || 'UNKNOWN',
      size: a.size || a.audience_size || a.cover_num || undefined,
      source_audience_id: a.source_audience_id || undefined,
      created_at: a.created_at || a.create_time || undefined,
    }));
  } catch (err) {
    console.error('Error fetching NewsBreak audiences:', err);
    return [];
  }
}

export async function createNewsBreakCustomAudience(
  userId: number,
  params: { audience_name: string; description?: string },
  accountId?: string
): Promise<{ audience_id: string }> {
  const auth = accountId
    ? (await getAllNewsBreakAuth(userId)).find(a => a.accountId === accountId) || await getNewsBreakAuth(userId)
    : await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  const data = await newsbreakRequest('POST', '/business-api/v1/dmp/customAudience/create', auth.accessToken, {
    advertiser_id: auth.accountId,
    audience_name: params.audience_name,
    description: params.description || '',
  });
  return { audience_id: String(data.audience_id || data.custom_audience_id || data.id) };
}

export async function uploadNewsBreakAudienceData(
  userId: number,
  audienceId: string,
  identifiers: { type: 'EMAIL' | 'PHONE' | 'DEVICE_ID'; values: string[] },
  accountId?: string
): Promise<void> {
  const auth = accountId
    ? (await getAllNewsBreakAuth(userId)).find(a => a.accountId === accountId) || await getNewsBreakAuth(userId)
    : await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  await newsbreakRequest('POST', '/business-api/v1/dmp/customAudience/upload', auth.accessToken, {
    advertiser_id: auth.accountId,
    audience_id: audienceId,
    id_type: identifiers.type,
    id_list: identifiers.values,
  });
}

export async function createNewsBreakLookalikeAudience(
  userId: number,
  params: {
    source_audience_id: string;
    audience_name: string;
    lookalike_ratio?: number; // e.g. 1-10 (percent)
  },
  accountId?: string
): Promise<{ audience_id: string }> {
  const auth = accountId
    ? (await getAllNewsBreakAuth(userId)).find(a => a.accountId === accountId) || await getNewsBreakAuth(userId)
    : await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  const data = await newsbreakRequest('POST', '/business-api/v1/dmp/lookalikeAudience/create', auth.accessToken, {
    advertiser_id: auth.accountId,
    source_audience_id: params.source_audience_id,
    audience_name: params.audience_name,
    lookalike_ratio: params.lookalike_ratio || 5,
  });
  return { audience_id: String(data.audience_id || data.lookalike_audience_id || data.id) };
}

export async function deleteNewsBreakAudience(
  userId: number,
  audienceId: string,
  accountId?: string
): Promise<void> {
  const auth = accountId
    ? (await getAllNewsBreakAuth(userId)).find(a => a.accountId === accountId) || await getNewsBreakAuth(userId)
    : await getNewsBreakAuth(userId);
  if (!auth) throw new Error('No NewsBreak credentials');
  await newsbreakRequest('POST', '/business-api/v1/dmp/customAudience/delete', auth.accessToken, {
    advertiser_id: auth.accountId,
    audience_id: audienceId,
  });
}

// ── Backward-compat aliases ────────────────────────────────────
// These are used by other files that still reference the old names
export const createNewsBreakAdGroup = createNewsBreakAdSet;
export const updateNewsBreakAdGroupStatus = updateNewsBreakAdSetStatus;
export const getNewsBreakAdGroupBudgets = getNewsBreakAdSetBudgets;
