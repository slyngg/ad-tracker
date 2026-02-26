/**
 * Meta Conversions API (CAPI) Relay Service — "Sonar"
 *
 * Takes enriched first-party pixel events from pixel_events_v2, hashes PII per
 * Meta spec, and sends them server-side to the Conversions API for improved
 * match quality and attribution accuracy.
 *
 * Key features:
 *   - SHA-256 hashing of email, phone per Meta requirements
 *   - Event deduplication via event_id (shared with browser pixel)
 *   - Batching up to 1000 events per request (Meta limit)
 *   - Full relay log for audit / debugging
 *   - Test event code support for validating in Events Manager
 */

import crypto from 'crypto';
import https from 'https';
import pool from '../db';
import { decrypt } from './oauth-providers';
import { createLogger } from '../lib/logger';

const log = createLogger('MetaCAPI');

const META_API_VERSION = 'v21.0';
const MAX_BATCH_SIZE = 1000;

// ── Standard event mapping ─────────────────────────────────────

const EVENT_NAME_MAP: Record<string, string> = {
  PageView: 'PageView',
  ViewContent: 'ViewContent',
  AddToCart: 'AddToCart',
  InitiateCheckout: 'InitiateCheckout',
  Purchase: 'Purchase',
  Lead: 'Lead',
  Subscribe: 'Subscribe',
};

// ── Types ───────────────────────────────────────────────────────

interface CapiConfig {
  id: number;
  user_id: number;
  pixel_id: string;
  access_token_encrypted: string | null;
  use_integration_token: boolean;
  enabled: boolean;
  event_filter: string[];
  test_event_code: string | null;
}

interface EnrichedEvent {
  event_id: string;
  event_name: string;
  event_time: number;
  event_source_url: string | null;
  user_data: MetaUserData;
  custom_data?: MetaCustomData;
  action_source: 'website';
  opt_out?: boolean;
}

interface MetaUserData {
  em?: string[];       // hashed email
  ph?: string[];       // hashed phone
  fn?: string[];       // hashed first name
  ln?: string[];       // hashed last name
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;        // Facebook click ID cookie
  fbp?: string;        // Facebook browser ID cookie
  external_id?: string[];
}

interface MetaCustomData {
  value?: number;
  currency?: string;
  content_ids?: string[];
  content_type?: string;
  num_items?: number;
  order_id?: string;
}

interface RawEventRow {
  id: number;
  user_id: number;
  visitor_id: number | null;
  session_id: string | null;
  event_name: string;
  event_category: string | null;
  page_url: string | null;
  page_title: string | null;
  order_id: string | null;
  revenue: number | null;
  currency: string | null;
  product_ids: string | null; // JSON array stored as text
  properties: any;
  event_id: string;
  client_ts: string | null;
  created_at: string;
}

interface VisitorRow {
  id: number;
  email: string | null;
  phone: string | null;
  anonymous_id: string | null;
  customer_id: string | null;
}

interface SessionRow {
  ip_address: string | null;
  user_agent: string | null;
  fbclid: string | null;
  started_at: string | null;
}

// ── Hashing helpers (Meta requires SHA-256, lowercase, trimmed) ─

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function hashEmail(email: string): string | null {
  if (!email) return null;
  return sha256(email.trim().toLowerCase());
}

function hashPhone(phone: string): string | null {
  if (!phone) return null;
  // Strip non-digits, Meta expects digits only before hashing
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return sha256(digits);
}

// ── Facebook cookie formatting ──────────────────────────────────

/**
 * Format fbc parameter: fb.1.{timestamp}.{fbclid}
 * See https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
 */
function formatFbc(fbclid: string, timestamp?: number): string {
  const ts = timestamp || Date.now();
  return `fb.1.${ts}.${fbclid}`;
}

/**
 * Generate a synthetic fbp (browser ID) from the visitor anonymous_id.
 * Format: fb.1.{timestamp}.{random}
 */
function generateFbp(anonymousId: string, firstSeenTs?: number): string {
  const ts = firstSeenTs || Date.now();
  // Use a hash of the anonymous ID as the random component for consistency
  const hash = crypto.createHash('md5').update(anonymousId).digest('hex').slice(0, 10);
  const numericHash = parseInt(hash, 16) % 10000000000;
  return `fb.1.${ts}.${numericHash}`;
}

// ── Access token resolution ─────────────────────────────────────

async function resolveAccessToken(config: CapiConfig): Promise<string | null> {
  // If config has its own token, use that
  if (config.access_token_encrypted) {
    try {
      return decrypt(config.access_token_encrypted);
    } catch (err) {
      log.error({ err, configId: config.id }, 'Failed to decrypt standalone CAPI access token');
    }
  }

  // Otherwise pull from integration_configs (Meta OAuth token)
  if (config.use_integration_token) {
    try {
      const result = await pool.query(
        `SELECT credentials FROM integration_configs
         WHERE user_id = $1 AND platform = 'meta' AND status = 'connected'
         LIMIT 1`,
        [config.user_id],
      );
      if (result.rows.length > 0) {
        const creds = result.rows[0].credentials;
        if (creds?.access_token_encrypted) {
          return decrypt(creds.access_token_encrypted);
        }
      }
    } catch (err) {
      log.error({ err, userId: config.user_id }, 'Failed to resolve Meta integration token');
    }
  }

  return null;
}

// ── Build Meta CAPI event from raw pixel event ──────────────────

function buildCapiEvent(
  event: RawEventRow,
  visitor: VisitorRow | null,
  session: SessionRow | null,
): EnrichedEvent {
  const metaEventName = EVENT_NAME_MAP[event.event_name] || event.event_name;

  // Determine event time (prefer client_ts, fall back to created_at)
  const eventTimeMs = event.client_ts
    ? new Date(event.client_ts).getTime()
    : new Date(event.created_at).getTime();
  const eventTime = Math.floor(eventTimeMs / 1000);

  // Build user_data
  const userData: MetaUserData = {};

  if (visitor?.email) {
    const hashed = hashEmail(visitor.email);
    if (hashed) userData.em = [hashed];
  }

  if (visitor?.phone) {
    const hashed = hashPhone(visitor.phone);
    if (hashed) userData.ph = [hashed];
  }

  if (session?.ip_address) {
    userData.client_ip_address = session.ip_address;
  }

  if (session?.user_agent) {
    userData.client_user_agent = session.user_agent;
  }

  // fbc — Facebook click ID cookie
  if (session?.fbclid) {
    const sessionTs = session.started_at ? new Date(session.started_at).getTime() : undefined;
    userData.fbc = formatFbc(session.fbclid, sessionTs);
  }

  // fbp — synthetic browser ID from visitor anonymous_id
  if (visitor?.anonymous_id) {
    userData.fbp = generateFbp(visitor.anonymous_id);
  }

  // external_id — use visitor customer_id or anonymous_id
  if (visitor?.customer_id) {
    userData.external_id = [sha256(visitor.customer_id)];
  } else if (visitor?.anonymous_id) {
    userData.external_id = [sha256(visitor.anonymous_id)];
  }

  const capiEvent: EnrichedEvent = {
    event_id: event.event_id,
    event_name: metaEventName,
    event_time: eventTime,
    event_source_url: event.page_url || null,
    user_data: userData,
    action_source: 'website',
  };

  // Build custom_data for commerce events
  if (metaEventName === 'Purchase') {
    const customData: MetaCustomData = {};
    if (event.revenue != null) customData.value = event.revenue;
    customData.currency = event.currency || 'USD';
    if (event.order_id) customData.order_id = event.order_id;

    // Parse product_ids
    let productIds: string[] = [];
    if (event.product_ids) {
      try {
        productIds = typeof event.product_ids === 'string'
          ? JSON.parse(event.product_ids)
          : event.product_ids;
      } catch { /* ignore parse errors */ }
    }
    if (productIds.length > 0) {
      customData.content_ids = productIds;
      customData.content_type = 'product';
      customData.num_items = productIds.length;
    }

    capiEvent.custom_data = customData;
  } else if (['ViewContent', 'AddToCart', 'InitiateCheckout'].includes(metaEventName)) {
    const customData: MetaCustomData = {};
    if (event.revenue != null) customData.value = event.revenue;
    if (event.currency) customData.currency = event.currency;

    let productIds: string[] = [];
    if (event.product_ids) {
      try {
        productIds = typeof event.product_ids === 'string'
          ? JSON.parse(event.product_ids)
          : event.product_ids;
      } catch { /* ignore */ }
    }
    if (productIds.length > 0) {
      customData.content_ids = productIds;
      customData.content_type = 'product';
      customData.num_items = productIds.length;
    }

    if (Object.keys(customData).length > 0) {
      capiEvent.custom_data = customData;
    }
  }

  return capiEvent;
}

// ── Send events to Meta CAPI ────────────────────────────────────

interface MetaCapiResponse {
  events_received?: number;
  messages?: string[];
  fbtrace_id?: string;
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

function sendToMeta(
  pixelId: string,
  accessToken: string,
  events: EnrichedEvent[],
  testEventCode?: string | null,
): Promise<{ status: number; body: MetaCapiResponse }> {
  return new Promise((resolve, reject) => {
    const payload: any = {
      data: events,
    };
    if (testEventCode) {
      payload.test_event_code = testEventCode;
    }

    const bodyStr = JSON.stringify(payload);
    const url = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${accessToken}`;
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 500, body: { error: { message: data, type: 'ParseError', code: 0, fbtrace_id: '' } } });
        }
      });
    });

    req.setTimeout(30_000, () => req.destroy(new Error('Meta CAPI request timeout after 30s')));
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Log relay results ───────────────────────────────────────────

async function logRelayResults(
  userId: number,
  configId: number,
  events: EnrichedEvent[],
  status: 'sent' | 'failed',
  httpStatus: number | null,
  metaResponse: MetaCapiResponse | null,
  errorMessage: string | null,
): Promise<void> {
  // Batch insert log rows
  if (events.length === 0) return;

  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIdx = 1;

  for (const evt of events) {
    placeholders.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7})`);
    values.push(
      userId,
      configId,
      evt.event_id,
      evt.event_name,
      status,
      httpStatus,
      metaResponse ? JSON.stringify(metaResponse) : null,
      errorMessage,
    );
    paramIdx += 8;
  }

  try {
    await pool.query(
      `INSERT INTO capi_relay_log (user_id, config_id, event_id, event_name, status, http_status, meta_response, error_message)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  } catch (err) {
    log.error({ err }, 'Failed to write CAPI relay log');
  }
}

// ── Send a batch of events for a single config ──────────────────

async function sendBatchForConfig(
  config: CapiConfig,
  accessToken: string,
  events: EnrichedEvent[],
): Promise<{ sent: number; failed: number }> {
  let totalSent = 0;
  let totalFailed = 0;

  // Split into chunks of MAX_BATCH_SIZE
  for (let i = 0; i < events.length; i += MAX_BATCH_SIZE) {
    const batch = events.slice(i, i + MAX_BATCH_SIZE);

    try {
      const result = await sendToMeta(
        config.pixel_id,
        accessToken,
        batch,
        config.test_event_code,
      );

      if (result.status === 200 && result.body.events_received) {
        totalSent += result.body.events_received;
        await logRelayResults(
          config.user_id,
          config.id,
          batch,
          'sent',
          result.status,
          result.body,
          null,
        );
        log.info(
          { pixelId: config.pixel_id, count: result.body.events_received },
          'CAPI batch sent successfully',
        );
      } else {
        totalFailed += batch.length;
        const errMsg = result.body.error?.message || `HTTP ${result.status}`;
        await logRelayResults(
          config.user_id,
          config.id,
          batch,
          'failed',
          result.status,
          result.body,
          errMsg,
        );
        log.error(
          { pixelId: config.pixel_id, httpStatus: result.status, error: errMsg },
          'CAPI batch failed',
        );
      }
    } catch (err: any) {
      totalFailed += batch.length;
      await logRelayResults(
        config.user_id,
        config.id,
        batch,
        'failed',
        null,
        null,
        err.message || 'Unknown error',
      );
      log.error({ err, pixelId: config.pixel_id }, 'CAPI batch request error');
    }
  }

  return { sent: totalSent, failed: totalFailed };
}

// ── Public: Process unsent events ───────────────────────────────

/**
 * Main relay loop: for each enabled CAPI config, find pixel events that have
 * not yet been relayed (no matching event_id in capi_relay_log), enrich them
 * with visitor/session data, and send to Meta.
 */
export async function processUnsentEvents(): Promise<{ sent: number; failed: number; configs: number }> {
  let totalSent = 0;
  let totalFailed = 0;
  let configsProcessed = 0;

  // Get all enabled configs
  const configResult = await pool.query(
    `SELECT * FROM capi_relay_configs WHERE enabled = true`,
  );
  const configs: CapiConfig[] = configResult.rows;

  for (const config of configs) {
    const accessToken = await resolveAccessToken(config);
    if (!accessToken) {
      log.warn({ configId: config.id, userId: config.user_id }, 'No access token available, skipping');
      continue;
    }

    // Build event filter clause
    let eventFilterClause = '';
    const eventFilter: string[] = Array.isArray(config.event_filter) ? config.event_filter : [];
    if (eventFilter.length > 0) {
      // Only relay events whose names are in the filter list
      const allowed = Object.keys(EVENT_NAME_MAP).filter(
        (name) => eventFilter.includes(name),
      );
      if (allowed.length > 0) {
        eventFilterClause = `AND e.event_name = ANY($3)`;
      } else {
        // Filter is set but none match standard events — skip
        continue;
      }
    }

    // Query unsent events (events in pixel_events_v2 not yet logged for this config)
    // Limit to events from the last 7 days to avoid processing ancient data
    const params: any[] = [config.user_id, config.id];
    let eventFilterParam = '';
    if (eventFilter.length > 0) {
      params.push(eventFilter);
      eventFilterParam = `AND e.event_name = ANY($3)`;
    }

    const eventsResult = await pool.query(
      `SELECT e.*
       FROM pixel_events_v2 e
       WHERE e.user_id = $1
         AND e.event_id IS NOT NULL
         AND e.created_at > NOW() - INTERVAL '7 days'
         AND e.event_name IN ('PageView','ViewContent','AddToCart','InitiateCheckout','Purchase','Lead','Subscribe')
         ${eventFilterParam}
         AND NOT EXISTS (
           SELECT 1 FROM capi_relay_log l
           WHERE l.event_id = e.event_id AND l.config_id = $2
         )
       ORDER BY e.created_at ASC
       LIMIT 5000`,
      params,
    );

    const rawEvents: RawEventRow[] = eventsResult.rows;
    if (rawEvents.length === 0) continue;

    // Collect unique visitor and session IDs for batch lookup
    const visitorIds = [...new Set(rawEvents.filter(e => e.visitor_id).map(e => e.visitor_id!))];
    const sessionIds = [...new Set(rawEvents.filter(e => e.session_id).map(e => e.session_id!))];

    // Batch fetch visitors
    const visitorMap = new Map<number, VisitorRow>();
    if (visitorIds.length > 0) {
      const vResult = await pool.query(
        `SELECT id, email, phone, anonymous_id, customer_id FROM pixel_visitors WHERE id = ANY($1)`,
        [visitorIds],
      );
      for (const row of vResult.rows) {
        visitorMap.set(row.id, row);
      }
    }

    // Batch fetch sessions
    const sessionMap = new Map<string, SessionRow>();
    if (sessionIds.length > 0) {
      const sResult = await pool.query(
        `SELECT session_id, ip_address, user_agent, fbclid, started_at
         FROM pixel_sessions WHERE user_id = $1 AND session_id = ANY($2)`,
        [config.user_id, sessionIds],
      );
      for (const row of sResult.rows) {
        sessionMap.set(row.session_id, row);
      }
    }

    // Build enriched events
    const enrichedEvents: EnrichedEvent[] = [];
    for (const rawEvt of rawEvents) {
      const visitor = rawEvt.visitor_id ? visitorMap.get(rawEvt.visitor_id) || null : null;
      const session = rawEvt.session_id ? sessionMap.get(rawEvt.session_id) || null : null;
      enrichedEvents.push(buildCapiEvent(rawEvt, visitor, session));
    }

    // Send
    const result = await sendBatchForConfig(config, accessToken, enrichedEvents);
    totalSent += result.sent;
    totalFailed += result.failed;
    configsProcessed++;
  }

  return { sent: totalSent, failed: totalFailed, configs: configsProcessed };
}

// ── Public: Send a single test event ────────────────────────────

export async function sendTestEvent(configId: number, userId: number): Promise<{
  success: boolean;
  events_received?: number;
  error?: string;
  meta_response?: MetaCapiResponse;
}> {
  const configResult = await pool.query(
    `SELECT * FROM capi_relay_configs WHERE id = $1 AND user_id = $2`,
    [configId, userId],
  );
  if (configResult.rows.length === 0) {
    return { success: false, error: 'Config not found' };
  }

  const config: CapiConfig = configResult.rows[0];
  const accessToken = await resolveAccessToken(config);
  if (!accessToken) {
    return { success: false, error: 'No access token available' };
  }

  // Build a synthetic test event
  const testEvent: EnrichedEvent = {
    event_id: `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    event_name: 'PageView',
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: 'https://opticdata.io/capi-test',
    user_data: {
      client_ip_address: '127.0.0.1',
      client_user_agent: 'OpticData CAPI Test',
    },
    action_source: 'website',
  };

  try {
    const result = await sendToMeta(
      config.pixel_id,
      accessToken,
      [testEvent],
      config.test_event_code || 'TEST_OPTICDATA',
    );

    if (result.status === 200 && result.body.events_received) {
      return {
        success: true,
        events_received: result.body.events_received,
        meta_response: result.body,
      };
    } else {
      return {
        success: false,
        error: result.body.error?.message || `HTTP ${result.status}`,
        meta_response: result.body,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Request failed',
    };
  }
}

// ── Public: Get relay stats for a user ──────────────────────────

export async function getRelayStats(userId: number): Promise<{
  total_sent: number;
  total_failed: number;
  success_rate: number;
  last_sent_at: string | null;
  events_today: number;
  events_this_week: number;
  by_event: Array<{ event_name: string; count: number }>;
}> {
  const [totals, today, week, byEvent, lastSent] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'sent') AS total_sent,
         COUNT(*) FILTER (WHERE status = 'failed') AS total_failed
       FROM capi_relay_log WHERE user_id = $1`,
      [userId],
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM capi_relay_log
       WHERE user_id = $1 AND status = 'sent' AND sent_at > CURRENT_DATE`,
      [userId],
    ),
    pool.query(
      `SELECT COUNT(*) AS cnt FROM capi_relay_log
       WHERE user_id = $1 AND status = 'sent' AND sent_at > NOW() - INTERVAL '7 days'`,
      [userId],
    ),
    pool.query(
      `SELECT event_name, COUNT(*) AS count FROM capi_relay_log
       WHERE user_id = $1 AND status = 'sent'
       GROUP BY event_name ORDER BY count DESC`,
      [userId],
    ),
    pool.query(
      `SELECT sent_at FROM capi_relay_log
       WHERE user_id = $1 AND status = 'sent'
       ORDER BY sent_at DESC LIMIT 1`,
      [userId],
    ),
  ]);

  const totalSent = parseInt(totals.rows[0]?.total_sent || '0', 10);
  const totalFailed = parseInt(totals.rows[0]?.total_failed || '0', 10);
  const total = totalSent + totalFailed;

  return {
    total_sent: totalSent,
    total_failed: totalFailed,
    success_rate: total > 0 ? Math.round((totalSent / total) * 10000) / 100 : 0,
    last_sent_at: lastSent.rows[0]?.sent_at || null,
    events_today: parseInt(today.rows[0]?.cnt || '0', 10),
    events_this_week: parseInt(week.rows[0]?.cnt || '0', 10),
    by_event: byEvent.rows.map((r) => ({ event_name: r.event_name, count: parseInt(r.count, 10) })),
  };
}
