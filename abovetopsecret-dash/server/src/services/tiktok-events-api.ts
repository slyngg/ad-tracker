/**
 * TikTok Events API Relay Service
 *
 * Sends enriched first-party pixel events to TikTok server-side via their
 * Events API v2 — the TikTok equivalent of Meta CAPI.
 *
 * Flow:
 *  1. Query pixel_events_v2 for events not yet relayed
 *  2. Enrich with visitor data (email, phone) and session data (IP, UA, ttclid)
 *  3. SHA256-hash PII, format for TikTok Events API, send in batches of 50
 *  4. Log results to tiktok_relay_log
 */

import crypto from 'crypto';
import https from 'https';
import pool from '../db';
import { decrypt } from './oauth-providers';
import { createLogger } from '../lib/logger';

const log = createLogger('TikTokEventsAPI');

const TIKTOK_EVENTS_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

// ── Event name mapping: OpticData → TikTok ────────────────────

const EVENT_MAP: Record<string, string> = {
  PageView: 'Pageview',
  ViewContent: 'ViewContent',
  AddToCart: 'AddToCart',
  InitiateCheckout: 'InitiateCheckout',
  Purchase: 'CompletePayment',
  Lead: 'SubmitForm',
  Subscribe: 'Subscribe',
};

const MAPPED_EVENTS = Object.keys(EVENT_MAP);

// ── Types ─────────────────────────────────────────────────────

interface RelayConfig {
  id: number;
  user_id: number;
  tiktok_pixel_id: string;
  access_token_ref: string;
  access_token_enc: string | null;
  enabled: boolean;
  test_event_code: string | null;
  event_filter: string[];
}

interface EnrichedEvent {
  event_db_id: number;
  event_name: string;
  tiktok_event: string;
  event_time: number;
  page_url: string | null;
  page_referrer: string | null;
  order_id: string | null;
  revenue: number | null;
  currency: string | null;
  product_ids: any;
  product_names: any;
  quantity: number | null;
  properties: Record<string, any>;
  // Visitor PII
  email: string | null;
  phone: string | null;
  // Session data
  ip_address: string | null;
  user_agent: string | null;
  ttclid: string | null;
  referrer: string | null;
}

interface TikTokEventPayload {
  event: string;
  event_time: number;
  event_id?: string;
  user: {
    email?: string;
    phone?: string;
    ip?: string;
    user_agent?: string;
    ttclid?: string;
  };
  page: {
    url?: string;
    referrer?: string;
  };
  properties: {
    contents?: Array<{
      content_id?: string;
      content_type?: string;
      content_name?: string;
      quantity?: number;
      price?: number;
    }>;
    value?: number;
    currency?: string;
  };
  test_event_code?: string;
}

// ── Helpers ───────────────────────────────────────────────────

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function hashIfPresent(value: string | null): string | undefined {
  if (!value || !value.trim()) return undefined;
  return sha256(value);
}

/**
 * Resolve the TikTok access token for a relay config.
 * If access_token_ref is 'oauth', pull from integration_configs.
 * Otherwise use the manually stored encrypted token.
 */
async function resolveAccessToken(config: RelayConfig): Promise<string | null> {
  if (config.access_token_ref === 'oauth') {
    try {
      const result = await pool.query(
        `SELECT credentials FROM integration_configs
         WHERE user_id = $1 AND platform = 'tiktok' AND status = 'connected'`,
        [config.user_id],
      );
      if (result.rows.length > 0) {
        const creds = result.rows[0].credentials;
        if (creds?.access_token_encrypted) {
          return decrypt(creds.access_token_encrypted);
        }
      }
    } catch (err) {
      log.error({ err, configId: config.id }, 'Failed to resolve OAuth token');
    }
    return null;
  }

  // Manual token
  if (config.access_token_enc) {
    try {
      return decrypt(config.access_token_enc);
    } catch (err) {
      log.error({ err, configId: config.id }, 'Failed to decrypt manual token');
    }
  }
  return null;
}

// ── TikTok HTTP POST ──────────────────────────────────────────

function postToTikTok(
  accessToken: string,
  body: { event_source: string; event_source_id: string; data: TikTokEventPayload[] },
): Promise<{ code: number; message: string; data?: any }> {
  const bodyStr = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const url = new URL(TIKTOK_EVENTS_URL);
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
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`TikTok API returned invalid JSON: ${data.slice(0, 300)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('TikTok API request timed out after 30s'));
    });
    req.write(bodyStr);
    req.end();
  });
}

// ── Build TikTok event payload ────────────────────────────────

function buildTikTokPayload(
  event: EnrichedEvent,
  testEventCode: string | null,
): TikTokEventPayload {
  const payload: TikTokEventPayload = {
    event: event.tiktok_event,
    event_time: event.event_time,
    event_id: String(event.event_db_id),
    user: {},
    page: {},
    properties: {},
  };

  // User data (SHA256-hashed PII)
  const hashedEmail = hashIfPresent(event.email);
  const hashedPhone = hashIfPresent(event.phone);
  if (hashedEmail) payload.user.email = hashedEmail;
  if (hashedPhone) payload.user.phone = hashedPhone;
  if (event.ip_address) payload.user.ip = event.ip_address;
  if (event.user_agent) payload.user.user_agent = event.user_agent;
  if (event.ttclid) payload.user.ttclid = event.ttclid;

  // Page data
  if (event.page_url) payload.page.url = event.page_url;
  if (event.page_referrer || event.referrer) {
    payload.page.referrer = event.page_referrer || event.referrer || undefined;
  }

  // Properties — for purchase events include contents, value, currency
  if (event.tiktok_event === 'CompletePayment' && event.revenue) {
    payload.properties.value = Number(event.revenue);
    payload.properties.currency = event.currency || 'USD';

    // Build contents array from product data
    const productIds: string[] = Array.isArray(event.product_ids) ? event.product_ids : [];
    const productNames: string[] = Array.isArray(event.product_names) ? event.product_names : [];

    if (productIds.length > 0) {
      payload.properties.contents = productIds.map((pid, i) => ({
        content_id: pid,
        content_type: 'product',
        content_name: productNames[i] || undefined,
        quantity: event.quantity || 1,
        price: productIds.length === 1 ? Number(event.revenue) : undefined,
      }));
    } else {
      // Minimal contents for TikTok
      payload.properties.contents = [{
        content_id: event.order_id || String(event.event_db_id),
        content_type: 'product',
        quantity: event.quantity || 1,
        price: Number(event.revenue),
      }];
    }
  } else if (event.revenue) {
    payload.properties.value = Number(event.revenue);
    payload.properties.currency = event.currency || 'USD';
  }

  // ViewContent — include content info if available
  if (event.tiktok_event === 'ViewContent' && event.product_ids) {
    const productIds: string[] = Array.isArray(event.product_ids) ? event.product_ids : [];
    if (productIds.length > 0) {
      const productNames: string[] = Array.isArray(event.product_names) ? event.product_names : [];
      payload.properties.contents = productIds.map((pid, i) => ({
        content_id: pid,
        content_type: 'product',
        content_name: productNames[i] || undefined,
      }));
    }
  }

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  return payload;
}

// ── Query unsent events for a config ──────────────────────────

async function getUnsentEvents(config: RelayConfig, limit: number = 200): Promise<EnrichedEvent[]> {
  // Determine which events to relay
  const eventFilter = config.event_filter && config.event_filter.length > 0
    ? config.event_filter.filter(e => MAPPED_EVENTS.includes(e))
    : MAPPED_EVENTS;

  if (eventFilter.length === 0) return [];

  // Query events that haven't been logged yet for this config
  const result = await pool.query(
    `SELECT
       e.id AS event_db_id,
       e.event_name,
       EXTRACT(EPOCH FROM COALESCE(e.client_ts, e.created_at))::bigint AS event_time,
       e.page_url,
       e.page_referrer,
       e.order_id,
       e.revenue,
       e.currency,
       e.product_ids,
       e.product_names,
       e.quantity,
       e.properties,
       v.email,
       v.phone,
       s.ip_address::text AS ip_address,
       s.user_agent,
       COALESCE(e.ttclid, s.ttclid) AS ttclid,
       s.referrer
     FROM pixel_events_v2 e
     LEFT JOIN pixel_visitors v ON v.id = e.visitor_id
     LEFT JOIN pixel_sessions s ON s.user_id = e.user_id AND s.session_id = e.session_id
     WHERE e.user_id = $1
       AND e.event_name = ANY($2)
       AND e.created_at > NOW() - INTERVAL '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM tiktok_relay_log l
         WHERE l.event_id = e.id AND l.config_id = $3
       )
     ORDER BY e.created_at ASC
     LIMIT $4`,
    [config.user_id, eventFilter, config.id, limit],
  );

  return result.rows.map(row => ({
    ...row,
    tiktok_event: EVENT_MAP[row.event_name] || row.event_name,
    product_ids: typeof row.product_ids === 'string' ? JSON.parse(row.product_ids) : row.product_ids,
    product_names: typeof row.product_names === 'string' ? JSON.parse(row.product_names) : row.product_names,
  }));
}

// ── Process and send events for a single config ───────────────

async function processConfigEvents(config: RelayConfig): Promise<{ sent: number; failed: number; skipped: number }> {
  const accessToken = await resolveAccessToken(config);
  if (!accessToken) {
    log.warn({ configId: config.id, userId: config.user_id }, 'No valid access token — skipping relay');
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const events = await getUnsentEvents(config);
  if (events.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // Process in batches of 50 (TikTok API limit)
  for (let i = 0; i < events.length; i += 50) {
    const batch = events.slice(i, i + 50);
    const payloads: TikTokEventPayload[] = [];
    const batchEvents: EnrichedEvent[] = [];

    for (const event of batch) {
      // Skip events without any user signal — TikTok needs at least one identifier
      if (!event.email && !event.phone && !event.ttclid && !event.ip_address) {
        totalSkipped++;
        await logRelay(config.id, event.event_db_id, event.event_name, EVENT_MAP[event.event_name], 'skipped', null, 'No user identifiers available');
        continue;
      }

      payloads.push(buildTikTokPayload(event, config.test_event_code));
      batchEvents.push(event);
    }

    if (payloads.length === 0) continue;

    try {
      const response = await postToTikTok(accessToken, {
        event_source: 'web',
        event_source_id: config.tiktok_pixel_id,
        data: payloads,
      });

      const isSuccess = response.code === 0;
      const status = isSuccess ? 'sent' : 'failed';
      const errorMsg = isSuccess ? null : (response.message || 'Unknown TikTok API error');

      for (const event of batchEvents) {
        await logRelay(
          config.id,
          event.event_db_id,
          event.event_name,
          event.tiktok_event,
          status,
          response,
          errorMsg,
        );
      }

      if (isSuccess) {
        totalSent += batchEvents.length;
      } else {
        totalFailed += batchEvents.length;
        log.error({ configId: config.id, code: response.code, message: response.message }, 'TikTok Events API error');
      }
    } catch (err: any) {
      totalFailed += batchEvents.length;
      log.error({ err, configId: config.id }, 'Failed to send batch to TikTok');

      for (const event of batchEvents) {
        await logRelay(config.id, event.event_db_id, event.event_name, event.tiktok_event, 'failed', null, err.message);
      }
    }
  }

  if (totalSent > 0 || totalFailed > 0) {
    log.info({ configId: config.id, sent: totalSent, failed: totalFailed, skipped: totalSkipped }, 'TikTok relay batch complete');
  }

  return { sent: totalSent, failed: totalFailed, skipped: totalSkipped };
}

// ── Log relay result ──────────────────────────────────────────

async function logRelay(
  configId: number,
  eventId: number,
  eventName: string,
  tiktokEvent: string,
  status: string,
  response: any,
  errorMessage: string | null,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO tiktok_relay_log (config_id, event_id, event_name, tiktok_event, status, tiktok_response, error_message, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        configId,
        eventId,
        eventName,
        tiktokEvent,
        status,
        response ? JSON.stringify(response) : null,
        errorMessage,
        status === 'sent' ? new Date() : null,
      ],
    );
  } catch (err) {
    log.error({ err, configId, eventId }, 'Failed to log relay result');
  }
}

// ── Public API ────────────────────────────────────────────────

/**
 * Process unsent events for all enabled TikTok relay configs.
 * Called by the scheduler on a periodic basis.
 */
export async function processUnsentEvents(): Promise<{ totalSent: number; totalFailed: number; totalSkipped: number; configsProcessed: number }> {
  const configs = await pool.query(
    `SELECT * FROM tiktok_relay_configs WHERE enabled = true`,
  );

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let configsProcessed = 0;

  for (const config of configs.rows as RelayConfig[]) {
    try {
      const result = await processConfigEvents(config);
      totalSent += result.sent;
      totalFailed += result.failed;
      totalSkipped += result.skipped;
      configsProcessed++;
    } catch (err) {
      log.error({ err, configId: config.id }, 'Failed to process config');
    }
  }

  return { totalSent, totalFailed, totalSkipped, configsProcessed };
}

/**
 * Process unsent events for a specific user's configs only.
 */
export async function processUnsentEventsForUser(userId: number): Promise<{ sent: number; failed: number; skipped: number }> {
  const configs = await pool.query(
    `SELECT * FROM tiktok_relay_configs WHERE user_id = $1 AND enabled = true`,
    [userId],
  );

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const config of configs.rows as RelayConfig[]) {
    const result = await processConfigEvents(config);
    totalSent += result.sent;
    totalFailed += result.failed;
    totalSkipped += result.skipped;
  }

  return { sent: totalSent, failed: totalFailed, skipped: totalSkipped };
}

/**
 * Send a single test event to TikTok for a given config.
 * Returns the raw TikTok API response.
 */
export async function sendTestEvent(
  configId: number,
  userId: number,
): Promise<{ success: boolean; response: any }> {
  const configResult = await pool.query(
    `SELECT * FROM tiktok_relay_configs WHERE id = $1 AND user_id = $2`,
    [configId, userId],
  );

  if (configResult.rows.length === 0) {
    throw new Error('Config not found');
  }

  const config = configResult.rows[0] as RelayConfig;
  const accessToken = await resolveAccessToken(config);

  if (!accessToken) {
    throw new Error('No valid access token available');
  }

  const testPayload: TikTokEventPayload = {
    event: 'Pageview',
    event_time: Math.floor(Date.now() / 1000),
    event_id: `test_${Date.now()}`,
    user: {
      ip: '127.0.0.1',
      user_agent: 'OpticData Test Event',
    },
    page: {
      url: 'https://example.com/test',
      referrer: 'https://example.com',
    },
    properties: {},
  };

  if (config.test_event_code) {
    testPayload.test_event_code = config.test_event_code;
  }

  const response = await postToTikTok(accessToken, {
    event_source: 'web',
    event_source_id: config.tiktok_pixel_id,
    data: [testPayload],
  });

  const success = response.code === 0;

  await logRelay(
    config.id,
    0,
    'TestEvent',
    'Pageview',
    success ? 'sent' : 'failed',
    response,
    success ? null : (response.message || 'Test event failed'),
  );

  return { success, response };
}

/**
 * Get relay statistics for a user's configs.
 */
export async function getRelayStats(userId: number): Promise<{
  configs: Array<{
    id: number;
    tiktok_pixel_id: string;
    enabled: boolean;
    total_sent: number;
    total_failed: number;
    total_skipped: number;
    last_sent_at: string | null;
    last_24h_sent: number;
    last_24h_failed: number;
  }>;
  totals: { sent: number; failed: number; skipped: number };
}> {
  const result = await pool.query(
    `SELECT
       c.id,
       c.tiktok_pixel_id,
       c.enabled,
       COALESCE(SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END), 0)::int AS total_sent,
       COALESCE(SUM(CASE WHEN l.status = 'failed' THEN 1 ELSE 0 END), 0)::int AS total_failed,
       COALESCE(SUM(CASE WHEN l.status = 'skipped' THEN 1 ELSE 0 END), 0)::int AS total_skipped,
       MAX(CASE WHEN l.status = 'sent' THEN l.sent_at END) AS last_sent_at,
       COALESCE(SUM(CASE WHEN l.status = 'sent' AND l.created_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0)::int AS last_24h_sent,
       COALESCE(SUM(CASE WHEN l.status = 'failed' AND l.created_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0)::int AS last_24h_failed
     FROM tiktok_relay_configs c
     LEFT JOIN tiktok_relay_log l ON l.config_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id, c.tiktok_pixel_id, c.enabled
     ORDER BY c.created_at ASC`,
    [userId],
  );

  const configs = result.rows;
  const totals = {
    sent: configs.reduce((sum: number, c: any) => sum + c.total_sent, 0),
    failed: configs.reduce((sum: number, c: any) => sum + c.total_failed, 0),
    skipped: configs.reduce((sum: number, c: any) => sum + c.total_skipped, 0),
  };

  return { configs, totals };
}

/**
 * Exported for use: the event name mapping.
 */
export { EVENT_MAP, MAPPED_EVENTS };
