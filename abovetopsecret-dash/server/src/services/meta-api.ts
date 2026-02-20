import https from 'https';

const GRAPH_API_VERSION = 'v19.0';
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
