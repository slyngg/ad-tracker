import pool from '../db';
import https from 'https';
import { getSetting } from './settings';
import { decrypt } from './oauth-providers';

// ── Auth resolution ────────────────────────────────────────────

async function getKlaviyoAuth(userId?: number): Promise<string | null> {
  if (userId) {
    try {
      const result = await pool.query(
        `SELECT credentials FROM integration_configs
         WHERE user_id = $1 AND platform = 'klaviyo' AND status = 'connected'`,
        [userId]
      );
      if (result.rows.length > 0) {
        const creds = result.rows[0].credentials;
        if (creds?.access_token_encrypted) {
          return decrypt(creds.access_token_encrypted);
        }
        if (creds?.api_key_encrypted) {
          return decrypt(creds.api_key_encrypted);
        }
      }
    } catch {
      // Fall through to getSetting
    }
  }

  return (await getSetting('klaviyo_api_key', userId)) || null;
}

// ── HTTP helpers ───────────────────────────────────────────────

const KLAVIYO_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_REVISION = '2024-10-15';

function klaviyoGet(path: string, apiKey: string): Promise<any> {
  const url = path.startsWith('http') ? path : `${KLAVIYO_BASE}${path}`;
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'revision': KLAVIYO_REVISION,
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

    req.on('error', reject);
    req.end();
  });
}

function klaviyoPost(path: string, apiKey: string, body: any): Promise<any> {
  const url = `${KLAVIYO_BASE}${path}`;
  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'revision': KLAVIYO_REVISION,
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

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Profiles ───────────────────────────────────────────────────

async function syncProfiles(apiKey: string, userId?: number): Promise<number> {
  let synced = 0;
  let url: string | null = '/profiles/';

  try {
    while (url) {
      const response = await klaviyoGet(url, apiKey);
      const profiles = response.data || [];

      for (const p of profiles) {
        try {
          const klaviyoId = p.id;
          if (!klaviyoId) continue;

          const attrs = p.attributes || {};
          const loc = attrs.location || {};
          const name = `${attrs.first_name || ''} ${attrs.last_name || ''}`.trim() || null;

          await pool.query(
            `INSERT INTO klaviyo_profiles (user_id, klaviyo_id, email, phone, name, location, total_clv, total_orders, last_event_date, properties, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             ON CONFLICT (user_id, klaviyo_id) DO UPDATE SET
               email = EXCLUDED.email, phone = EXCLUDED.phone, name = EXCLUDED.name,
               location = EXCLUDED.location, total_clv = EXCLUDED.total_clv,
               total_orders = EXCLUDED.total_orders, last_event_date = EXCLUDED.last_event_date,
               properties = EXCLUDED.properties, synced_at = NOW()`,
            [
              userId || null,
              klaviyoId,
              attrs.email || null,
              attrs.phone_number || null,
              name,
              JSON.stringify(loc),
              parseFloat(attrs.predictive_analytics?.historic_clv || '0') || 0,
              parseInt(attrs.predictive_analytics?.historic_number_of_orders || '0') || 0,
              attrs.last_event_date || null,
              JSON.stringify(attrs.properties || {}),
            ]
          );
          synced++;
        } catch (err) {
          console.error(`[Klaviyo Sync] Failed to upsert profile:`, err);
        }
      }

      url = response.links?.next || null;
    }
  } catch (err) {
    console.error(`[Klaviyo Sync] Profiles fetch failed:`, err);
  }

  return synced;
}

// ── Lists ──────────────────────────────────────────────────────

async function syncLists(apiKey: string, userId?: number): Promise<number> {
  let synced = 0;
  let url: string | null = '/lists/';

  try {
    while (url) {
      const response = await klaviyoGet(url, apiKey);
      const lists = response.data || [];

      for (const l of lists) {
        try {
          const listId = l.id;
          if (!listId) continue;

          const attrs = l.attributes || {};

          await pool.query(
            `INSERT INTO klaviyo_lists (user_id, list_id, name, type, profile_count, synced_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (user_id, list_id) DO UPDATE SET
               name = EXCLUDED.name, type = EXCLUDED.type,
               profile_count = EXCLUDED.profile_count, synced_at = NOW()`,
            [
              userId || null,
              listId,
              attrs.name || null,
              l.type || 'list',
              attrs.profile_count || 0,
            ]
          );
          synced++;
        } catch (err) {
          console.error(`[Klaviyo Sync] Failed to upsert list:`, err);
        }
      }

      url = response.links?.next || null;
    }
  } catch (err) {
    console.error(`[Klaviyo Sync] Lists fetch failed:`, err);
  }

  return synced;
}

// ── Campaigns ──────────────────────────────────────────────────

async function syncCampaigns(apiKey: string, userId?: number): Promise<number> {
  let synced = 0;
  let url: string | null = '/campaigns/';

  try {
    while (url) {
      const response = await klaviyoGet(url, apiKey);
      const campaigns = response.data || [];

      for (const c of campaigns) {
        try {
          const campaignId = c.id;
          if (!campaignId) continue;

          const attrs = c.attributes || {};
          const sendOpts = attrs.send_options || {};
          const stats = attrs.statistics || {};

          await pool.query(
            `INSERT INTO klaviyo_campaigns (user_id, campaign_id, name, type, status, subject_line, send_time, sent_count, open_count, click_count, bounce_count, unsub_count, revenue, open_rate, click_rate, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
             ON CONFLICT (user_id, campaign_id) DO UPDATE SET
               name = EXCLUDED.name, type = EXCLUDED.type, status = EXCLUDED.status,
               subject_line = EXCLUDED.subject_line, send_time = EXCLUDED.send_time,
               sent_count = EXCLUDED.sent_count, open_count = EXCLUDED.open_count,
               click_count = EXCLUDED.click_count, bounce_count = EXCLUDED.bounce_count,
               unsub_count = EXCLUDED.unsub_count, revenue = EXCLUDED.revenue,
               open_rate = EXCLUDED.open_rate, click_rate = EXCLUDED.click_rate, synced_at = NOW()`,
            [
              userId || null,
              campaignId,
              attrs.name || null,
              attrs.channel || attrs.type || 'email',
              attrs.status || null,
              attrs.message?.subject || sendOpts.subject || null,
              attrs.send_time || attrs.scheduled_at || null,
              stats.sent || stats.recipients || 0,
              stats.opens || stats.unique_opens || 0,
              stats.clicks || stats.unique_clicks || 0,
              stats.bounces || 0,
              stats.unsubscribes || 0,
              parseFloat(stats.revenue || '0') || 0,
              parseFloat(stats.open_rate || '0') || 0,
              parseFloat(stats.click_rate || '0') || 0,
            ]
          );
          synced++;
        } catch (err) {
          console.error(`[Klaviyo Sync] Failed to upsert campaign:`, err);
        }
      }

      url = response.links?.next || null;
    }
  } catch (err) {
    console.error(`[Klaviyo Sync] Campaigns fetch failed:`, err);
  }

  return synced;
}

// ── Flow Metrics ───────────────────────────────────────────────

async function syncFlowMetrics(apiKey: string, userId?: number): Promise<number> {
  let synced = 0;

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const metricNames = [
    'Received Email', 'Opened Email', 'Clicked Email',
    'Received SMS', 'Clicked SMS',
    'Placed Order', 'Ordered Product',
  ];

  for (const metricName of metricNames) {
    try {
      const response = await klaviyoPost('/metric-aggregates/', apiKey, {
        data: {
          type: 'metric-aggregate',
          attributes: {
            metric_id: metricName,
            measurements: ['count', 'unique', 'sum_value'],
            interval: 'day',
            filter: [`greater-or-equal(datetime,${startDate}T00:00:00)`, `less-than(datetime,${endDate}T23:59:59)`],
            by: [],
          },
        },
      });

      const results = response.data?.attributes?.dates || [];
      const counts = response.data?.attributes?.data?.[0]?.measurements?.count || [];
      const uniques = response.data?.attributes?.data?.[0]?.measurements?.unique || [];
      const sums = response.data?.attributes?.data?.[0]?.measurements?.sum_value || [];

      for (let i = 0; i < results.length; i++) {
        try {
          const date = results[i]?.split('T')?.[0];
          if (!date) continue;

          await pool.query(
            `INSERT INTO klaviyo_flow_metrics (user_id, date, metric_name, event_count, unique_profiles, revenue, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (user_id, date, metric_name) DO UPDATE SET
               event_count = EXCLUDED.event_count, unique_profiles = EXCLUDED.unique_profiles,
               revenue = EXCLUDED.revenue, synced_at = NOW()`,
            [
              userId || null,
              date,
              metricName,
              counts[i] || 0,
              uniques[i] || 0,
              parseFloat(sums[i] || '0') || 0,
            ]
          );
          synced++;
        } catch (err) {
          console.error(`[Klaviyo Sync] Failed to upsert flow metric:`, err);
        }
      }
    } catch (err) {
      console.error(`[Klaviyo Sync] Flow metric ${metricName} fetch failed:`, err);
    }
  }

  return synced;
}

// ── Full sync orchestrator ─────────────────────────────────────

export async function syncAllKlaviyoData(userId?: number): Promise<{
  profiles: number;
  lists: number;
  campaigns: number;
  flowMetrics: number;
  skipped: boolean;
}> {
  const apiKey = await getKlaviyoAuth(userId);
  if (!apiKey) return { profiles: 0, lists: 0, campaigns: 0, flowMetrics: 0, skipped: true };

  const profiles = await syncProfiles(apiKey, userId);
  const lists = await syncLists(apiKey, userId);
  const campaigns = await syncCampaigns(apiKey, userId);
  const flowMetrics = await syncFlowMetrics(apiKey, userId);

  console.log(`[Klaviyo Sync] Done${userId ? ` for user ${userId}` : ''}: ${profiles} profiles, ${lists} lists, ${campaigns} campaigns, ${flowMetrics} flow metrics`);

  return { profiles, lists, campaigns, flowMetrics, skipped: false };
}
