import https from 'https';
import FormData from 'form-data';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export async function metaApiPost(
  endpoint: string,
  params: Record<string, string>,
  accessToken: string
): Promise<any> {
  const urlParams = new URLSearchParams({ ...params, access_token: accessToken });
  const url = `${GRAPH_API_BASE}${endpoint}?${urlParams.toString()}`;

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST' }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.error?.message || `Meta API error: ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Meta API returned invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export async function pauseAdset(adsetId: string, accessToken: string): Promise<any> {
  return metaApiPost(`/${adsetId}`, { status: 'PAUSED' }, accessToken);
}

export async function enableAdset(adsetId: string, accessToken: string): Promise<any> {
  return metaApiPost(`/${adsetId}`, { status: 'ACTIVE' }, accessToken);
}

export async function adjustBudget(
  adsetId: string,
  budgetCents: number,
  accessToken: string
): Promise<any> {
  if (budgetCents < 100) {
    throw new Error('Budget cannot be less than $1.00/day');
  }
  return metaApiPost(`/${adsetId}`, { daily_budget: String(budgetCents) }, accessToken);
}

export async function metaApiGet(
  endpoint: string,
  params: Record<string, string>,
  accessToken: string
): Promise<any> {
  const urlParams = new URLSearchParams({ ...params, access_token: accessToken });
  const url = `${GRAPH_API_BASE}${endpoint}?${urlParams.toString()}`;

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.error?.message || `Meta API error: ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Meta API returned invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export async function increaseBudget(
  adsetId: string,
  percent: number,
  accessToken: string
): Promise<any> {
  const adset = await metaApiGet(`/${adsetId}`, { fields: 'daily_budget' }, accessToken);
  const currentBudgetCents = parseInt(adset.daily_budget, 10);
  const newBudgetCents = Math.max(100, Math.round(currentBudgetCents * (1 + percent / 100)));
  return adjustBudget(adsetId, newBudgetCents, accessToken);
}

export async function decreaseBudget(
  adsetId: string,
  percent: number,
  accessToken: string
): Promise<any> {
  const adset = await metaApiGet(`/${adsetId}`, { fields: 'daily_budget' }, accessToken);
  const currentBudgetCents = parseInt(adset.daily_budget, 10);
  const newBudgetCents = Math.max(100, Math.round(currentBudgetCents * (1 - percent / 100)));
  return adjustBudget(adsetId, newBudgetCents, accessToken);
}

// ── Campaign Creation API ───────────────────────────────────

export async function createCampaign(
  accountId: string,
  params: { name: string; objective: string; status?: string; special_ad_categories?: string[] },
  accessToken: string
): Promise<any> {
  const body: Record<string, string> = {
    name: params.name,
    objective: params.objective,
    status: params.status || 'PAUSED',
  };
  if (params.special_ad_categories?.length) {
    body.special_ad_categories = JSON.stringify(params.special_ad_categories);
  } else {
    body.special_ad_categories = '[]';
  }
  return metaApiPost(`/${accountId}/campaigns`, body, accessToken);
}

export async function createAdSet(
  accountId: string,
  params: {
    name: string;
    campaign_id: string;
    targeting: any;
    daily_budget?: number;
    lifetime_budget?: number;
    bid_strategy?: string;
    start_time?: string;
    end_time?: string;
    billing_event?: string;
    optimization_goal?: string;
    status?: string;
  },
  accessToken: string
): Promise<any> {
  const body: Record<string, string> = {
    name: params.name,
    campaign_id: params.campaign_id,
    targeting: JSON.stringify(params.targeting),
    billing_event: params.billing_event || 'IMPRESSIONS',
    optimization_goal: params.optimization_goal || 'LINK_CLICKS',
    status: params.status || 'PAUSED',
  };
  if (params.daily_budget) body.daily_budget = String(params.daily_budget);
  if (params.lifetime_budget) body.lifetime_budget = String(params.lifetime_budget);
  if (params.bid_strategy) body.bid_strategy = params.bid_strategy;
  if (params.start_time) body.start_time = params.start_time;
  if (params.end_time) body.end_time = params.end_time;
  return metaApiPost(`/${accountId}/adsets`, body, accessToken);
}

export async function createAdCreative(
  accountId: string,
  params: {
    name: string;
    object_story_spec: any;
  },
  accessToken: string
): Promise<any> {
  return metaApiPost(`/${accountId}/adcreatives`, {
    name: params.name,
    object_story_spec: JSON.stringify(params.object_story_spec),
  }, accessToken);
}

export async function createAd(
  accountId: string,
  params: { name: string; adset_id: string; creative_id: string; status?: string },
  accessToken: string
): Promise<any> {
  return metaApiPost(`/${accountId}/ads`, {
    name: params.name,
    adset_id: params.adset_id,
    creative: JSON.stringify({ creative_id: params.creative_id }),
    status: params.status || 'PAUSED',
  }, accessToken);
}

export async function metaApiPostMultipart(
  endpoint: string,
  form: FormData,
  accessToken: string
): Promise<any> {
  const url = `${GRAPH_API_BASE}${endpoint}?access_token=${encodeURIComponent(accessToken)}`;
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: form.getHeaders(),
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(parsed.error?.message || `Meta API error: ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Meta API returned invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

export async function uploadAdImage(
  accountId: string,
  imageBuffer: Buffer,
  filename: string,
  accessToken: string
): Promise<{ hash: string; url: string }> {
  const form = new FormData();
  form.append('filename', imageBuffer, { filename });
  const result = await metaApiPostMultipart(`/${accountId}/adimages`, form, accessToken);
  const images = result.images;
  const key = Object.keys(images)[0];
  return { hash: images[key].hash, url: images[key].url };
}

export async function searchInterests(
  query: string,
  accessToken: string
): Promise<any[]> {
  const result = await metaApiGet('/search', {
    type: 'adinterest',
    q: query,
  }, accessToken);
  return result.data || [];
}

export async function getCustomAudiences(
  accountId: string,
  accessToken: string
): Promise<any[]> {
  const result = await metaApiGet(`/${accountId}/customaudiences`, {
    fields: 'id,name,approximate_count,subtype',
  }, accessToken);
  return result.data || [];
}

export async function getAdAccountPages(
  accountId: string,
  accessToken: string
): Promise<any[]> {
  const result = await metaApiGet(`/${accountId}/promote_pages`, {
    fields: 'id,name,picture',
  }, accessToken);
  return result.data || [];
}

export async function updateCampaignStatus(
  campaignId: string,
  status: 'ACTIVE' | 'PAUSED',
  accessToken: string
): Promise<any> {
  return metaApiPost(`/${campaignId}`, { status }, accessToken);
}

// ── Ad Library API ──────────────────────────────────────────

export async function searchAdLibrary(
  params: {
    search_terms?: string;
    search_page_ids?: string[];
    ad_reached_countries: string[];
    ad_active_status?: string;
    ad_type?: string;
    limit?: number;
    after?: string;
  },
  accessToken: string
): Promise<{ data: any[]; paging?: { cursors?: { after?: string }; next?: string } }> {
  const queryParams: Record<string, string> = {
    ad_reached_countries: JSON.stringify(params.ad_reached_countries),
    fields: 'id,ad_creation_time,ad_creative_bodies,ad_creative_link_captions,ad_creative_link_descriptions,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time,ad_snapshot_url,bylines,currency,impressions,page_id,page_name,publisher_platforms,spend,estimated_audience_size',
    limit: String(params.limit || 25),
  };
  if (params.search_terms) queryParams.search_terms = params.search_terms;
  if (params.search_page_ids?.length) queryParams.search_page_ids = JSON.stringify(params.search_page_ids);
  if (params.ad_active_status) queryParams.ad_active_status = params.ad_active_status;
  if (params.ad_type) queryParams.ad_type = params.ad_type;
  if (params.after) queryParams.after = params.after;
  return metaApiGet('/ads_archive', queryParams, accessToken);
}
