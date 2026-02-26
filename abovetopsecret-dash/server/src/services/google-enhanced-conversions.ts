/**
 * Google Enhanced Conversions Relay Service
 *
 * Sends enriched first-party pixel events to Google server-side via the
 * GA4 Measurement Protocol — the Google equivalent of Meta CAPI.
 *
 * Flow:
 *  1. Query pixel_events_v2 for events not yet relayed
 *  2. Enrich with visitor data (email, phone) and session data (IP, UA, gclid)
 *  3. SHA256-hash PII for enhanced matching via user_properties
 *  4. Format for GA4 Measurement Protocol, send in batches of 25
 *  5. Log results to google_relay_log
 *
 * Endpoint: POST https://www.google-analytics.com/mp/collect?measurement_id={mid}&api_secret={secret}
 */

import crypto from 'crypto';
import https from 'https';
import pool from '../db';
import { encrypt, decrypt } from './oauth-providers';
import { createLogger } from '../lib/logger';

const log = createLogger('GoogleEnhancedConversions');

const GA4_COLLECT_URL = 'https://www.google-analytics.com/mp/collect';
const MAX_BATCH_SIZE = 25; // GA4 Measurement Protocol limit

// ── Event name mapping: OpticData → GA4 ─────────────────────

const EVENT_MAP: Record<string, string> = {
  PageView: 'page_view',
  ViewContent: 'view_item',
  AddToCart: 'add_to_cart',
  InitiateCheckout: 'begin_checkout',
  Purchase: 'purchase',
  Lead: 'generate_lead',
  Subscribe: 'sign_up',
};

const MAPPED_EVENTS = Object.keys(EVENT_MAP);

// ── Types ───────────────────────────────────────────────────

interface RelayConfig {
  id: number;
  user_id: number;
  measurement_id: string;
  api_secret: string;          // encrypted
  google_ads_customer_id: string | null;
  conversion_action_id: string | null;
  enabled: boolean;
  event_filter: string[];
}

interface EnrichedEvent {
  event_db_id: number;
  event_name: string;
  ga4_event: string;
  event_time: number;           // epoch seconds
  page_url: string | null;
  page_title: string | null;
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
  anonymous_id: string | null;
  customer_id: string | null;
  // Session data
  ip_address: string | null;
  user_agent: string | null;
  gclid: string | null;
  referrer: string | null;
}

interface GA4Event {
  name: string;
  params: Record<string, any>;
}

interface GA4Payload {
  client_id: string;
  user_id?: string;
  timestamp_micros?: string;
  user_properties?: Record<string, { value: string }>;
  events: GA4Event[];
}

// ── Helpers ─────────────────────────────────────────────────

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function hashIfPresent(value: string | null): string | undefined {
  if (!value || !value.trim()) return undefined;
  return sha256(value);
}

/**
 * Resolve the GA4 API secret for a relay config.
 */
function resolveApiSecret(config: RelayConfig): string | null {
  if (!config.api_secret) return null;
  try {
    return decrypt(config.api_secret);
  } catch (err) {
    log.error({ err, configId: config.id }, 'Failed to decrypt API secret');
    return null;
  }
}

// ── GA4 Measurement Protocol HTTP POST ──────────────────────

function postToGA4(
  measurementId: string,
  apiSecret: string,
  payload: GA4Payload,
): Promise<{ status: number; body: any }> {
  const bodyStr = JSON.stringify(payload);
  const url = `${GA4_COLLECT_URL}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          // GA4 Measurement Protocol returns 2xx with empty body on success
          try {
            const body = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode || 500, body });
          } catch {
            resolve({ status: res.statusCode || 500, body: { raw: data } });
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('GA4 Measurement Protocol request timed out after 30s'));
    });
    req.write(bodyStr);
    req.end();
  });
}

/**
 * Use the validation endpoint for test events to get detailed error feedback.
 * Same as collect but at /debug/mp/collect.
 */
function postToGA4Debug(
  measurementId: string,
  apiSecret: string,
  payload: GA4Payload,
): Promise<{ status: number; body: any }> {
  const bodyStr = JSON.stringify(payload);
  const url = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 500, body: { raw: data } });
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('GA4 debug request timed out after 30s'));
    });
    req.write(bodyStr);
    req.end();
  });
}

// ── Build GA4 event payload from enriched event ─────────────

function buildGA4Payload(event: EnrichedEvent): GA4Payload {
  // client_id: use visitor anonymous_id (required by GA4 MP)
  const clientId = event.anonymous_id || `opticdata_${event.event_db_id}`;

  // user_id: use customer_id or hashed email if available
  let userId: string | undefined;
  if (event.customer_id) {
    userId = event.customer_id;
  } else if (event.email) {
    userId = sha256(event.email);
  }

  // Build event params based on GA4 event type
  const ga4Event: GA4Event = {
    name: event.ga4_event,
    params: {},
  };

  // Common params
  if (event.page_url) ga4Event.params.page_location = event.page_url;
  if (event.page_title) ga4Event.params.page_title = event.page_title;
  if (event.gclid) ga4Event.params.gclid = event.gclid;

  // Parse product data
  let productIds: string[] = [];
  let productNames: string[] = [];
  if (event.product_ids) {
    productIds = Array.isArray(event.product_ids) ? event.product_ids : [];
  }
  if (event.product_names) {
    productNames = Array.isArray(event.product_names) ? event.product_names : [];
  }

  // Event-specific params
  switch (event.ga4_event) {
    case 'purchase':
      if (event.order_id) ga4Event.params.transaction_id = event.order_id;
      if (event.revenue != null) ga4Event.params.value = Number(event.revenue);
      ga4Event.params.currency = event.currency || 'USD';
      if (productIds.length > 0) {
        ga4Event.params.items = productIds.map((pid, i) => ({
          item_id: pid,
          item_name: productNames[i] || pid,
          quantity: event.quantity || 1,
          price: productIds.length === 1 ? Number(event.revenue) : undefined,
        }));
      } else {
        // Minimal item for GA4 requirement
        ga4Event.params.items = [{
          item_id: event.order_id || String(event.event_db_id),
          item_name: 'Purchase',
          quantity: event.quantity || 1,
          price: event.revenue != null ? Number(event.revenue) : undefined,
        }];
      }
      break;

    case 'view_item':
      if (event.revenue != null) ga4Event.params.value = Number(event.revenue);
      if (event.currency) ga4Event.params.currency = event.currency;
      if (productIds.length > 0) {
        ga4Event.params.items = productIds.map((pid, i) => ({
          item_id: pid,
          item_name: productNames[i] || pid,
        }));
      }
      break;

    case 'add_to_cart':
      if (event.revenue != null) ga4Event.params.value = Number(event.revenue);
      if (event.currency) ga4Event.params.currency = event.currency;
      if (productIds.length > 0) {
        ga4Event.params.items = productIds.map((pid, i) => ({
          item_id: pid,
          item_name: productNames[i] || pid,
          quantity: event.quantity || 1,
        }));
      }
      break;

    case 'begin_checkout':
      if (event.revenue != null) ga4Event.params.value = Number(event.revenue);
      if (event.currency) ga4Event.params.currency = event.currency;
      if (productIds.length > 0) {
        ga4Event.params.items = productIds.map((pid, i) => ({
          item_id: pid,
          item_name: productNames[i] || pid,
          quantity: event.quantity || 1,
        }));
      }
      break;

    case 'generate_lead':
      if (event.revenue != null) {
        ga4Event.params.value = Number(event.revenue);
        ga4Event.params.currency = event.currency || 'USD';
      }
      break;

    case 'sign_up':
      ga4Event.params.method = 'website';
      break;

    case 'page_view':
      // page_location and page_title already set above
      break;
  }

  // Build payload
  const payload: GA4Payload = {
    client_id: clientId,
    events: [ga4Event],
  };

  if (userId) {
    payload.user_id = userId;
  }

  // Include timestamp in microseconds for server-side events
  if (event.event_time) {
    payload.timestamp_micros = String(event.event_time * 1000000);
  }

  // User properties with hashed PII for enhanced matching
  const userProperties: Record<string, { value: string }> = {};
  const hashedEmail = hashIfPresent(event.email);
  const hashedPhone = hashIfPresent(event.phone);
  if (hashedEmail) {
    userProperties.email_sha256 = { value: hashedEmail };
  }
  if (hashedPhone) {
    userProperties.phone_sha256 = { value: hashedPhone };
  }
  if (Object.keys(userProperties).length > 0) {
    payload.user_properties = userProperties;
  }

  return payload;
}

// ── Query unsent events for a config ────────────────────────

async function getUnsentEvents(config: RelayConfig, limit: number = 500): Promise<EnrichedEvent[]> {
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
       e.page_title,
       e.order_id,
       e.revenue,
       e.currency,
       e.product_ids,
       e.product_names,
       e.quantity,
       e.properties,
       v.email,
       v.phone,
       v.anonymous_id,
       v.customer_id,
       s.ip_address::text AS ip_address,
       s.user_agent,
       COALESCE(e.gclid, s.gclid) AS gclid,
       s.referrer
     FROM pixel_events_v2 e
     LEFT JOIN pixel_visitors v ON v.id = e.visitor_id
     LEFT JOIN pixel_sessions s ON s.user_id = e.user_id AND s.session_id = e.session_id
     WHERE e.user_id = $1
       AND e.event_name = ANY($2)
       AND e.created_at > NOW() - INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM google_relay_log l
         WHERE l.event_id = e.id AND l.config_id = $3
       )
     ORDER BY e.created_at ASC
     LIMIT $4`,
    [config.user_id, eventFilter, config.id, limit],
  );

  return result.rows.map(row => ({
    ...row,
    ga4_event: EVENT_MAP[row.event_name] || row.event_name,
    product_ids: typeof row.product_ids === 'string' ? JSON.parse(row.product_ids) : row.product_ids,
    product_names: typeof row.product_names === 'string' ? JSON.parse(row.product_names) : row.product_names,
  }));
}

// ── Log relay result ────────────────────────────────────────

async function logRelay(
  configId: number,
  eventId: number,
  eventName: string,
  ga4Event: string,
  status: string,
  response: any,
  errorMessage: string | null,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO google_relay_log (config_id, event_id, event_name, ga4_event, status, google_response, error_message, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        configId,
        eventId,
        eventName,
        ga4Event,
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

// ── Batch log relay results ─────────────────────────────────

async function logRelayBatch(
  configId: number,
  events: EnrichedEvent[],
  status: string,
  response: any,
  errorMessage: string | null,
): Promise<void> {
  if (events.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIdx = 1;

  for (const evt of events) {
    placeholders.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7})`,
    );
    values.push(
      configId,
      evt.event_db_id,
      evt.event_name,
      evt.ga4_event,
      status,
      response ? JSON.stringify(response) : null,
      errorMessage,
      status === 'sent' ? new Date() : null,
    );
    paramIdx += 8;
  }

  try {
    await pool.query(
      `INSERT INTO google_relay_log (config_id, event_id, event_name, ga4_event, status, google_response, error_message, sent_at)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  } catch (err) {
    log.error({ err, configId }, 'Failed to write batch relay log');
  }
}

// ── Process and send events for a single config ─────────────

async function processConfigEvents(config: RelayConfig): Promise<{ sent: number; failed: number; skipped: number }> {
  const apiSecret = resolveApiSecret(config);
  if (!apiSecret) {
    log.warn({ configId: config.id, userId: config.user_id }, 'No valid API secret — skipping relay');
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const events = await getUnsentEvents(config);
  if (events.length === 0) return { sent: 0, failed: 0, skipped: 0 };

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // Process in batches of MAX_BATCH_SIZE (25)
  for (let i = 0; i < events.length; i += MAX_BATCH_SIZE) {
    const batch = events.slice(i, i + MAX_BATCH_SIZE);
    const validEvents: EnrichedEvent[] = [];
    const skippedEvents: EnrichedEvent[] = [];

    for (const event of batch) {
      // GA4 Measurement Protocol requires at least a client_id, which we always have
      // But skip events without any useful user signal for enhanced matching
      if (!event.email && !event.phone && !event.gclid && !event.anonymous_id) {
        skippedEvents.push(event);
        continue;
      }
      validEvents.push(event);
    }

    // Log skipped events
    for (const event of skippedEvents) {
      totalSkipped++;
      await logRelay(config.id, event.event_db_id, event.event_name, EVENT_MAP[event.event_name], 'skipped', null, 'No user identifiers available');
    }

    if (validEvents.length === 0) continue;

    // GA4 Measurement Protocol sends one payload per client_id, but we can
    // batch multiple events per payload if they share the same client_id.
    // Group events by client_id (anonymous_id).
    const groupedByClient = new Map<string, EnrichedEvent[]>();
    for (const event of validEvents) {
      const clientId = event.anonymous_id || `opticdata_${event.event_db_id}`;
      if (!groupedByClient.has(clientId)) {
        groupedByClient.set(clientId, []);
      }
      groupedByClient.get(clientId)!.push(event);
    }

    // Send each group
    for (const [, groupEvents] of groupedByClient) {
      // Build a combined payload with multiple events for the same client_id
      const firstEvent = groupEvents[0];
      const firstPayload = buildGA4Payload(firstEvent);

      // If multiple events for same client, add them all
      if (groupEvents.length > 1) {
        firstPayload.events = groupEvents.map(evt => {
          const p = buildGA4Payload(evt);
          return p.events[0];
        });
      }

      try {
        const response = await postToGA4(
          config.measurement_id,
          apiSecret,
          firstPayload,
        );

        // GA4 Measurement Protocol returns 2xx with empty body on success,
        // non-2xx on error
        const isSuccess = response.status >= 200 && response.status < 300;
        const status = isSuccess ? 'sent' : 'failed';
        const errorMsg = isSuccess ? null : `HTTP ${response.status}: ${JSON.stringify(response.body)}`;

        await logRelayBatch(config.id, groupEvents, status, response.body, errorMsg);

        if (isSuccess) {
          totalSent += groupEvents.length;
        } else {
          totalFailed += groupEvents.length;
          log.error({ configId: config.id, httpStatus: response.status, body: response.body }, 'GA4 Measurement Protocol error');
        }
      } catch (err: any) {
        totalFailed += groupEvents.length;
        log.error({ err, configId: config.id }, 'Failed to send batch to GA4');

        await logRelayBatch(config.id, groupEvents, 'failed', null, err.message);
      }
    }
  }

  if (totalSent > 0 || totalFailed > 0) {
    log.info({ configId: config.id, sent: totalSent, failed: totalFailed, skipped: totalSkipped }, 'Google relay batch complete');
  }

  return { sent: totalSent, failed: totalFailed, skipped: totalSkipped };
}

// ── Public API ──────────────────────────────────────────────

/**
 * Process unsent events for all enabled Google relay configs.
 * Called by the scheduler on a periodic basis.
 */
export async function processUnsentEvents(): Promise<{ totalSent: number; totalFailed: number; totalSkipped: number; configsProcessed: number }> {
  const configs = await pool.query(
    `SELECT * FROM google_relay_configs WHERE enabled = true`,
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
    `SELECT * FROM google_relay_configs WHERE user_id = $1 AND enabled = true`,
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
 * Send a single test event to GA4 for a given config.
 * Uses the debug endpoint to get validation feedback.
 */
export async function sendTestEvent(
  configId: number,
  userId: number,
): Promise<{ success: boolean; response: any }> {
  const configResult = await pool.query(
    `SELECT * FROM google_relay_configs WHERE id = $1 AND user_id = $2`,
    [configId, userId],
  );

  if (configResult.rows.length === 0) {
    throw new Error('Config not found');
  }

  const config = configResult.rows[0] as RelayConfig;
  const apiSecret = resolveApiSecret(config);

  if (!apiSecret) {
    throw new Error('No valid API secret available');
  }

  const testPayload: GA4Payload = {
    client_id: `opticdata_test_${Date.now()}`,
    events: [
      {
        name: 'page_view',
        params: {
          page_location: 'https://opticdata.io/google-relay-test',
          page_title: 'OpticData Google Relay Test',
          engagement_time_msec: '100',
        },
      },
    ],
  };

  // Use debug endpoint for test events — it returns validation results
  const response = await postToGA4Debug(
    config.measurement_id,
    apiSecret,
    testPayload,
  );

  // Debug endpoint returns { validationMessages: [...] }
  const validationMessages = response.body?.validationMessages || [];
  const success = response.status >= 200 && response.status < 300 && validationMessages.length === 0;

  await logRelay(
    config.id,
    0,
    'TestEvent',
    'page_view',
    success ? 'sent' : 'failed',
    response.body,
    success ? null : (validationMessages.length > 0 ? JSON.stringify(validationMessages) : `HTTP ${response.status}`),
  );

  return { success, response: response.body };
}

/**
 * Get relay statistics for a user's configs.
 */
export async function getRelayStats(userId: number): Promise<{
  configs: Array<{
    id: number;
    measurement_id: string;
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
       c.measurement_id,
       c.enabled,
       COALESCE(SUM(CASE WHEN l.status = 'sent' THEN 1 ELSE 0 END), 0)::int AS total_sent,
       COALESCE(SUM(CASE WHEN l.status = 'failed' THEN 1 ELSE 0 END), 0)::int AS total_failed,
       COALESCE(SUM(CASE WHEN l.status = 'skipped' THEN 1 ELSE 0 END), 0)::int AS total_skipped,
       MAX(CASE WHEN l.status = 'sent' THEN l.sent_at END) AS last_sent_at,
       COALESCE(SUM(CASE WHEN l.status = 'sent' AND l.created_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0)::int AS last_24h_sent,
       COALESCE(SUM(CASE WHEN l.status = 'failed' AND l.created_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0)::int AS last_24h_failed
     FROM google_relay_configs c
     LEFT JOIN google_relay_log l ON l.config_id = c.id
     WHERE c.user_id = $1
     GROUP BY c.id, c.measurement_id, c.enabled
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
