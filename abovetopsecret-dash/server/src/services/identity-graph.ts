/**
 * Identity Graph Service
 *
 * Handles visitor identity resolution, session management, and identity merging.
 * Similar to Triple Whale's ID Graph — stitches anonymous visitors across devices,
 * sessions, and cookie clears using first-party data signals.
 */

import pool from '../db';
import { classifyCustomer, updateFirstOrderDate } from './new-vs-returning';
import { createLogger } from '../lib/logger';

const log = createLogger('IdentityGraph');

// ── Types ────────────────────────────────────────────────────

export interface VisitorIdentifiers {
  anonymousId: string;
  email?: string;
  phone?: string;
  customerId?: string;
  fingerprint?: string;
}

export interface SessionData {
  sessionId: string;
  visitorId: number;
  referrer?: string;
  landingPage?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  sclid?: string;
  msclkid?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  screenWidth?: number;
  screenHeight?: number;
  timezone?: string;
  language?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface EventData {
  visitorId?: number;
  sessionId: string;
  eventName: string;
  eventCategory?: string;
  pageUrl?: string;
  pageTitle?: string;
  pageReferrer?: string;
  orderId?: string;
  revenue?: number;
  currency?: string;
  productIds?: string[];
  productNames?: string[];
  quantity?: number;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  properties?: Record<string, any>;
  eventId?: string;
  clientTs?: string;
}

// ── Resolve or create visitor ────────────────────────────────

/**
 * Find or create a visitor record. If identifiers match an existing visitor
 * (by email, phone, customerId, or fingerprint), merge into that identity.
 */
export async function resolveVisitor(
  userId: number,
  siteId: number,
  identifiers: VisitorIdentifiers,
): Promise<{ visitorId: number; isNew: boolean; merged: boolean }> {
  const { anonymousId, email, phone, customerId, fingerprint } = identifiers;

  // 1. Try to find by anonymous_id first (most common — same device, same browser)
  const existing = await pool.query(
    `SELECT id, canonical_id, email, phone, customer_id, fingerprint
     FROM pixel_visitors
     WHERE user_id = $1 AND anonymous_id = $2`,
    [userId, anonymousId],
  );

  if (existing.rows.length > 0) {
    const visitor = existing.rows[0];
    const visitorId = visitor.canonical_id || visitor.id;

    // Update last_seen and any new identifiers
    const updates: string[] = ['last_seen_at = NOW()'];
    const params: any[] = [];
    let paramIdx = 1;

    if (email && !visitor.email) {
      updates.push(`email = $${paramIdx}`);
      params.push(email.toLowerCase());
      paramIdx++;
    }
    if (phone && !visitor.phone) {
      updates.push(`phone = $${paramIdx}`);
      params.push(phone);
      paramIdx++;
    }
    if (customerId && !visitor.customer_id) {
      updates.push(`customer_id = $${paramIdx}`);
      params.push(customerId);
      paramIdx++;
    }
    if (fingerprint && !visitor.fingerprint) {
      updates.push(`fingerprint = $${paramIdx}`);
      params.push(fingerprint);
      paramIdx++;
    }

    params.push(visitor.id);
    await pool.query(
      `UPDATE pixel_visitors SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      params,
    );

    // If new identifying info was provided, try to merge with other visitors
    let merged = false;
    if (email || phone || customerId) {
      merged = await attemptMerge(userId, visitorId, identifiers);
    }

    return { visitorId, isNew: false, merged };
  }

  // 2. Before creating new, check if any known identifier matches an existing visitor
  const matchedVisitorId = await findByKnownIdentifiers(userId, identifiers);

  if (matchedVisitorId) {
    // Create the anonymous_id record pointing to the matched visitor
    await pool.query(
      `INSERT INTO pixel_visitors (user_id, site_id, anonymous_id, email, phone, customer_id, fingerprint, canonical_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, anonymous_id) DO UPDATE SET
         canonical_id = EXCLUDED.canonical_id,
         last_seen_at = NOW()`,
      [userId, siteId, anonymousId, email?.toLowerCase() || null, phone || null, customerId || null, fingerprint || null, matchedVisitorId],
    );

    // Log the merge
    const newRow = await pool.query(
      `SELECT id FROM pixel_visitors WHERE user_id = $1 AND anonymous_id = $2`,
      [userId, anonymousId],
    );
    if (newRow.rows.length > 0 && newRow.rows[0].id !== matchedVisitorId) {
      await logMerge(userId, newRow.rows[0].id, matchedVisitorId, 'identifier_match');
    }

    return { visitorId: matchedVisitorId, isNew: false, merged: true };
  }

  // 3. Create new visitor
  const result = await pool.query(
    `INSERT INTO pixel_visitors (user_id, site_id, anonymous_id, email, phone, customer_id, fingerprint, first_referrer, first_landing)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, anonymous_id) DO UPDATE SET last_seen_at = NOW()
     RETURNING id`,
    [userId, siteId, anonymousId, email?.toLowerCase() || null, phone || null, customerId || null, fingerprint || null, null, null],
  );

  return { visitorId: result.rows[0].id, isNew: true, merged: false };
}

// ── Find existing visitor by known identifiers ───────────────

async function findByKnownIdentifiers(
  userId: number,
  identifiers: VisitorIdentifiers,
): Promise<number | null> {
  const { email, phone, customerId, fingerprint } = identifiers;

  // Priority: email > phone > customerId > fingerprint
  if (email) {
    const r = await pool.query(
      `SELECT COALESCE(canonical_id, id) AS vid FROM pixel_visitors
       WHERE user_id = $1 AND email = $2 AND canonical_id IS NULL
       ORDER BY last_seen_at DESC LIMIT 1`,
      [userId, email.toLowerCase()],
    );
    if (r.rows.length > 0) return r.rows[0].vid;
  }

  if (phone) {
    const r = await pool.query(
      `SELECT COALESCE(canonical_id, id) AS vid FROM pixel_visitors
       WHERE user_id = $1 AND phone = $2 AND canonical_id IS NULL
       ORDER BY last_seen_at DESC LIMIT 1`,
      [userId, phone],
    );
    if (r.rows.length > 0) return r.rows[0].vid;
  }

  if (customerId) {
    const r = await pool.query(
      `SELECT COALESCE(canonical_id, id) AS vid FROM pixel_visitors
       WHERE user_id = $1 AND customer_id = $2 AND canonical_id IS NULL
       ORDER BY last_seen_at DESC LIMIT 1`,
      [userId, customerId],
    );
    if (r.rows.length > 0) return r.rows[0].vid;
  }

  if (fingerprint) {
    const r = await pool.query(
      `SELECT COALESCE(canonical_id, id) AS vid FROM pixel_visitors
       WHERE user_id = $1 AND fingerprint = $2 AND canonical_id IS NULL
       ORDER BY last_seen_at DESC LIMIT 1`,
      [userId, fingerprint],
    );
    if (r.rows.length > 0) return r.rows[0].vid;
  }

  return null;
}

// ── Attempt merge with existing visitors ─────────────────────

async function attemptMerge(
  userId: number,
  currentVisitorId: number,
  identifiers: VisitorIdentifiers,
): Promise<boolean> {
  const { email, phone, customerId } = identifiers;
  let merged = false;

  // Find other visitors with same email/phone/customerId that aren't already merged
  const candidates: Array<{ id: number; reason: string }> = [];

  if (email) {
    const r = await pool.query(
      `SELECT id FROM pixel_visitors
       WHERE user_id = $1 AND email = $2 AND id != $3 AND canonical_id IS NULL`,
      [userId, email.toLowerCase(), currentVisitorId],
    );
    for (const row of r.rows) candidates.push({ id: row.id, reason: 'email_match' });
  }

  if (phone) {
    const r = await pool.query(
      `SELECT id FROM pixel_visitors
       WHERE user_id = $1 AND phone = $2 AND id != $3 AND canonical_id IS NULL`,
      [userId, phone, currentVisitorId],
    );
    for (const row of r.rows) {
      if (!candidates.find(c => c.id === row.id)) {
        candidates.push({ id: row.id, reason: 'phone_match' });
      }
    }
  }

  if (customerId) {
    const r = await pool.query(
      `SELECT id FROM pixel_visitors
       WHERE user_id = $1 AND customer_id = $2 AND id != $3 AND canonical_id IS NULL`,
      [userId, customerId, currentVisitorId],
    );
    for (const row of r.rows) {
      if (!candidates.find(c => c.id === row.id)) {
        candidates.push({ id: row.id, reason: 'customer_id_match' });
      }
    }
  }

  // Merge: point all candidates to currentVisitorId as canonical
  for (const candidate of candidates) {
    await pool.query(
      `UPDATE pixel_visitors SET canonical_id = $1, merged_at = NOW() WHERE id = $2`,
      [currentVisitorId, candidate.id],
    );

    // Also update any visitors that pointed to the candidate
    await pool.query(
      `UPDATE pixel_visitors SET canonical_id = $1 WHERE canonical_id = $2`,
      [currentVisitorId, candidate.id],
    );

    // Re-point sessions
    await pool.query(
      `UPDATE pixel_sessions SET visitor_id = $1 WHERE visitor_id = $2`,
      [currentVisitorId, candidate.id],
    );

    // Re-point touchpoints
    await pool.query(
      `UPDATE pixel_touchpoints SET visitor_id = $1 WHERE visitor_id = $2`,
      [currentVisitorId, candidate.id],
    );

    // Accumulate stats on canonical
    await pool.query(
      `UPDATE pixel_visitors v SET
         total_sessions = v.total_sessions + s.total_sessions,
         total_events = v.total_events + s.total_events,
         total_revenue = v.total_revenue + s.total_revenue,
         first_seen_at = LEAST(v.first_seen_at, s.first_seen_at)
       FROM pixel_visitors s
       WHERE v.id = $1 AND s.id = $2`,
      [currentVisitorId, candidate.id],
    );

    await logMerge(userId, candidate.id, currentVisitorId, candidate.reason);
    merged = true;
  }

  return merged;
}

// ── Log identity merge ───────────────────────────────────────

async function logMerge(
  userId: number,
  sourceId: number,
  targetId: number,
  reason: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO pixel_identity_merges (user_id, source_visitor, target_visitor, merge_reason)
     VALUES ($1, $2, $3, $4)`,
    [userId, sourceId, targetId, reason],
  );
}

// ── Upsert session ───────────────────────────────────────────

export async function upsertSession(userId: number, data: SessionData): Promise<void> {
  await pool.query(
    `INSERT INTO pixel_sessions (
       user_id, visitor_id, session_id,
       referrer, landing_page,
       utm_source, utm_medium, utm_campaign, utm_content, utm_term,
       fbclid, gclid, ttclid, sclid, msclkid,
       device_type, browser, os, screen_width, screen_height, timezone, language,
       ip_address, user_agent
     ) VALUES (
       $1, $2, $3,
       $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, $14, $15,
       $16, $17, $18, $19, $20, $21, $22,
       $23, $24
     )
     ON CONFLICT (user_id, session_id) DO UPDATE SET
       last_activity = NOW(),
       page_count = pixel_sessions.page_count + 1,
       event_count = pixel_sessions.event_count + 1,
       is_bounce = false`,
    [
      userId, data.visitorId, data.sessionId,
      data.referrer || null, data.landingPage || null,
      data.utmSource || null, data.utmMedium || null, data.utmCampaign || null, data.utmContent || null, data.utmTerm || null,
      data.fbclid || null, data.gclid || null, data.ttclid || null, data.sclid || null, data.msclkid || null,
      data.deviceType || null, data.browser || null, data.os || null, data.screenWidth || null, data.screenHeight || null, data.timezone || null, data.language || null,
      data.ipAddress || null, data.userAgent || null,
    ],
  );
}

// ── Record event ─────────────────────────────────────────────

export async function recordEvent(userId: number, visitorId: number | null, data: EventData): Promise<void> {
  await pool.query(
    `INSERT INTO pixel_events_v2 (
       user_id, visitor_id, session_id,
       event_name, event_category, page_url, page_title, page_referrer,
       order_id, revenue, currency, product_ids, product_names, quantity,
       fbclid, gclid, ttclid,
       properties, event_id, client_ts
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14,
       $15, $16, $17,
       $18, $19, $20
     )
     ON CONFLICT (user_id, event_id) WHERE event_id IS NOT NULL DO NOTHING`,
    [
      userId, visitorId, data.sessionId,
      data.eventName, data.eventCategory || null, data.pageUrl || null, data.pageTitle || null, data.pageReferrer || null,
      data.orderId || null, data.revenue || null, data.currency || 'USD',
      data.productIds ? JSON.stringify(data.productIds) : null,
      data.productNames ? JSON.stringify(data.productNames) : null,
      data.quantity || null,
      data.fbclid || null, data.gclid || null, data.ttclid || null,
      JSON.stringify(data.properties || {}), data.eventId || null, data.clientTs || null,
    ],
  );

  // Update visitor event count
  if (visitorId) {
    await pool.query(
      `UPDATE pixel_visitors SET total_events = total_events + 1, last_seen_at = NOW() WHERE id = $1`,
      [visitorId],
    );
  }

  // Update session event count
  if (data.sessionId) {
    const isConversion = ['Purchase', 'Lead', 'Subscribe'].includes(data.eventName);
    await pool.query(
      `UPDATE pixel_sessions SET
         event_count = event_count + 1,
         last_activity = NOW(),
         has_conversion = has_conversion OR $2
       WHERE user_id = $1 AND session_id = $3`,
      [userId, isConversion, data.sessionId],
    );
  }

  // If purchase event, update visitor revenue & record touchpoint conversion
  if (data.eventName === 'Purchase' && data.revenue && visitorId) {
    await pool.query(
      `UPDATE pixel_visitors SET total_revenue = total_revenue + $1 WHERE id = $2`,
      [data.revenue, visitorId],
    );

    // Mark the most recent touchpoint for this visitor as converted
    await pool.query(
      `UPDATE pixel_touchpoints SET converted = true, order_id = $1, revenue = $2
       WHERE id = (
         SELECT id FROM pixel_touchpoints
         WHERE visitor_id = $3 AND converted = false
         ORDER BY touched_at DESC LIMIT 1
       )`,
      [data.orderId, data.revenue, visitorId],
    );

    // Classify as new vs returning customer and stamp the event
    if (data.orderId) {
      try {
        const emailResult = await pool.query(
          `SELECT email FROM pixel_visitors WHERE id = $1`,
          [visitorId],
        );
        const email = emailResult.rows[0]?.email || null;
        const isNew = await classifyCustomer(userId, email, visitorId, data.orderId);

        await pool.query(
          `UPDATE pixel_events_v2
           SET is_new_customer = $1
           WHERE user_id = $2 AND order_id = $3 AND event_name = 'Purchase'`,
          [isNew, userId, data.orderId],
        );

        if (isNew) {
          await updateFirstOrderDate(visitorId, new Date());
        }
      } catch (err) {
        log.warn({ userId, visitorId, orderId: data.orderId, err }, 'Failed to classify new vs returning on event');
      }
    }
  }
}

// ── Record touchpoint ────────────────────────────────────────

export async function recordTouchpoint(
  userId: number,
  visitorId: number,
  sessionId: string,
  clickIds: { fbclid?: string; gclid?: string; ttclid?: string; sclid?: string; msclkid?: string },
  utms: { source?: string; medium?: string; campaign?: string; content?: string; term?: string },
): Promise<void> {
  // Determine platform from click ID or UTM source
  let platform = 'direct';
  let clickId: string | null = null;

  if (clickIds.fbclid) { platform = 'meta'; clickId = clickIds.fbclid; }
  else if (clickIds.gclid) { platform = 'google'; clickId = clickIds.gclid; }
  else if (clickIds.ttclid) { platform = 'tiktok'; clickId = clickIds.ttclid; }
  else if (clickIds.sclid) { platform = 'snapchat'; clickId = clickIds.sclid; }
  else if (clickIds.msclkid) { platform = 'bing'; clickId = clickIds.msclkid; }
  else if (utms.source) {
    const src = utms.source.toLowerCase();
    if (src.includes('facebook') || src.includes('fb') || src.includes('meta') || src.includes('ig')) platform = 'meta';
    else if (src.includes('google')) platform = 'google';
    else if (src.includes('tiktok')) platform = 'tiktok';
    else if (src.includes('snapchat') || src.includes('snap')) platform = 'snapchat';
    else if (src.includes('bing') || src.includes('microsoft')) platform = 'bing';
    else if (src.includes('newsbreak')) platform = 'newsbreak';
    else platform = 'referral';
  } else if (utms.medium) {
    platform = 'referral';
  }

  // Don't record direct/organic touchpoints without any identifying info
  if (platform === 'direct' && !utms.source && !utms.campaign) return;

  await pool.query(
    `INSERT INTO pixel_touchpoints (user_id, visitor_id, session_id, platform, click_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      userId, visitorId, sessionId, platform, clickId,
      utms.source || null, utms.medium || null, utms.campaign || null, utms.content || null, utms.term || null,
    ],
  );
}

// ── Identify: link anonymous visitor to known identity ───────

export async function identifyVisitor(
  userId: number,
  anonymousId: string,
  identifiers: { email?: string; phone?: string; customerId?: string },
): Promise<{ visitorId: number; merged: boolean }> {
  const visitor = await pool.query(
    `SELECT id, canonical_id FROM pixel_visitors WHERE user_id = $1 AND anonymous_id = $2`,
    [userId, anonymousId],
  );

  if (visitor.rows.length === 0) {
    // Visitor doesn't exist yet — shouldn't happen normally but handle gracefully
    const result = await resolveVisitor(userId, 0, { anonymousId, ...identifiers });
    return { visitorId: result.visitorId, merged: result.merged };
  }

  const visitorId = visitor.rows[0].canonical_id || visitor.rows[0].id;

  // Update identifiers on the canonical visitor
  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (identifiers.email) {
    updates.push(`email = COALESCE(email, $${idx})`);
    params.push(identifiers.email.toLowerCase());
    idx++;
  }
  if (identifiers.phone) {
    updates.push(`phone = COALESCE(phone, $${idx})`);
    params.push(identifiers.phone);
    idx++;
  }
  if (identifiers.customerId) {
    updates.push(`customer_id = COALESCE(customer_id, $${idx})`);
    params.push(identifiers.customerId);
    idx++;
  }

  if (updates.length > 0) {
    params.push(visitorId);
    await pool.query(
      `UPDATE pixel_visitors SET ${updates.join(', ')}, last_seen_at = NOW() WHERE id = $${idx}`,
      params,
    );
  }

  // Try to merge with other visitors that share these identifiers
  const merged = await attemptMerge(userId, visitorId, {
    anonymousId,
    ...identifiers,
  });

  return { visitorId, merged };
}

// ── Get visitor journey ──────────────────────────────────────

export async function getVisitorJourney(userId: number, visitorId: number) {
  const [visitor, sessions, touchpoints, events] = await Promise.all([
    pool.query(
      `SELECT * FROM pixel_visitors WHERE id = $1 AND user_id = $2`,
      [visitorId, userId],
    ),
    pool.query(
      `SELECT * FROM pixel_sessions WHERE visitor_id = $1 ORDER BY started_at ASC`,
      [visitorId],
    ),
    pool.query(
      `SELECT * FROM pixel_touchpoints WHERE visitor_id = $1 ORDER BY touched_at ASC`,
      [visitorId],
    ),
    pool.query(
      `SELECT event_name, event_category, page_url, order_id, revenue, properties, created_at
       FROM pixel_events_v2 WHERE visitor_id = $1 ORDER BY created_at ASC LIMIT 200`,
      [visitorId],
    ),
  ]);

  return {
    visitor: visitor.rows[0] || null,
    sessions: sessions.rows,
    touchpoints: touchpoints.rows,
    events: events.rows,
  };
}
