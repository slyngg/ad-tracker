/**
 * Pixel Sites — Authenticated routes for managing site tokens & pixel settings
 *
 * These are dashboard-facing routes (behind auth middleware) for:
 * - Creating/managing site tokens
 * - Viewing pixel installation snippets
 * - Browsing visitor/session/event data
 * - Viewing the identity graph
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { getVisitorJourney } from '../services/identity-graph';
import { generateDnsChallenge, verifyDns, getDnsStatus } from '../services/dns-pixel';

const router = Router();

// ── Generate a site token ────────────────────────────────────

function generateSiteToken(): string {
  return 'ODT-' + crypto.randomBytes(12).toString('hex');
}

// ── GET /api/pixel-sites — list user's sites ─────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await pool.query(
      `SELECT ps.*,
         (SELECT COUNT(*) FROM pixel_visitors pv WHERE pv.user_id = ps.user_id AND pv.site_id = ps.id) AS visitor_count,
         (SELECT COUNT(*) FROM pixel_sessions pses WHERE pses.user_id = ps.user_id) AS session_count
       FROM pixel_sites ps WHERE ps.user_id = $1 ORDER BY ps.created_at ASC`,
      [userId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pixel sites:', err);
    res.status(500).json({ error: 'Failed to fetch sites' });
  }
});

// ── POST /api/pixel-sites — create a new site ────────────────

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, domain, settings } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const siteToken = generateSiteToken();

    const result = await pool.query(
      `INSERT INTO pixel_sites (user_id, site_token, domain, name, settings)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, siteToken, domain || null, name, settings ? JSON.stringify(settings) : '{}'],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating pixel site:', err);
    res.status(500).json({ error: 'Failed to create site' });
  }
});

// ── PUT /api/pixel-sites/:id — update site settings ──────────

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { name, domain, settings, enabled } = req.body;

    const result = await pool.query(
      `UPDATE pixel_sites SET
         name = COALESCE($3, name),
         domain = COALESCE($4, domain),
         settings = COALESCE($5, settings),
         enabled = COALESCE($6, enabled),
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId, name || null, domain || null, settings ? JSON.stringify(settings) : null, enabled ?? null],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating pixel site:', err);
    res.status(500).json({ error: 'Failed to update site' });
  }
});

// ── DELETE /api/pixel-sites/:id — delete a site ──────────────

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM pixel_sites WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting pixel site:', err);
    res.status(500).json({ error: 'Failed to delete site' });
  }
});

// ── POST /api/pixel-sites/:id/dns/setup — Initialize DNS setup ──

router.post('/:id/dns/setup', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { customDomain } = req.body;

    if (!customDomain) {
      res.status(400).json({ error: 'customDomain is required' });
      return;
    }

    const challenge = await generateDnsChallenge(parseInt(id), userId!, customDomain);
    res.json(challenge);
  } catch (err: any) {
    console.error('Error setting up DNS:', err);
    res.status(err.message === 'Site not found' ? 404 : 400).json({ error: err.message || 'Failed to setup DNS' });
  }
});

// ── POST /api/pixel-sites/:id/dns/verify — Verify DNS records ──

router.post('/:id/dns/verify', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await verifyDns(parseInt(id), userId!);
    res.json(result);
  } catch (err: any) {
    console.error('Error verifying DNS:', err);
    const status = err.message === 'Site not found' ? 404 : 400;
    res.status(status).json({ error: err.message || 'Failed to verify DNS' });
  }
});

// ── GET /api/pixel-sites/:id/dns/status — Get DNS status ──

router.get('/:id/dns/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const status = await getDnsStatus(parseInt(id), userId!);
    res.json(status);
  } catch (err: any) {
    console.error('Error fetching DNS status:', err);
    res.status(err.message === 'Site not found' ? 404 : 500).json({ error: err.message || 'Failed to fetch DNS status' });
  }
});

// ── GET /api/pixel-sites/:id/snippet — installation snippet ──

router.get('/:id/snippet', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    const result = await pool.query(
      'SELECT site_token, domain, custom_domain, dns_verified FROM pixel_sites WHERE id = $1 AND user_id = $2',
      [id, userId],
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    const { site_token, custom_domain, dns_verified } = result.rows[0];
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    // Use verified custom domain for the snippet if available
    const baseUrl = (dns_verified && custom_domain)
      ? `https://${custom_domain}`
      : `${proto}://${host}`;

    const snippet = `<!-- OpticData Pixel -->
<script>
  (function(w){w.odtq=w.odtq||[];w.__odt=w.__odt||{track:function(){w.odtq.push(["track"].concat(Array.prototype.slice.call(arguments)))},identify:function(){w.odtq.push(["identify"].concat(Array.prototype.slice.call(arguments)))},pageView:function(){w.odtq.push(["pageView"].concat(Array.prototype.slice.call(arguments)))},viewContent:function(){w.odtq.push(["viewContent"].concat(Array.prototype.slice.call(arguments)))},addToCart:function(){w.odtq.push(["addToCart"].concat(Array.prototype.slice.call(arguments)))},initiateCheckout:function(){w.odtq.push(["initiateCheckout"].concat(Array.prototype.slice.call(arguments)))},purchase:function(){w.odtq.push(["purchase"].concat(Array.prototype.slice.call(arguments)))},lead:function(){w.odtq.push(["lead"].concat(Array.prototype.slice.call(arguments)))},subscribe:function(){w.odtq.push(["subscribe"].concat(Array.prototype.slice.call(arguments)))}}})(window);
</script>
<script async src="${baseUrl}/t/pixel.js?token=${site_token}"></script>
<noscript><img src="${baseUrl}/t/ping.gif?token=${site_token}" width="1" height="1" alt="" style="display:none"/></noscript>
<!-- End OpticData Pixel -->`;

    const checkoutSnippet = `<!-- OpticData — Checkout/Thank You Page -->
<script>
  // Call this after a successful purchase
  window.__odt.purchase({
    order_id: "ORDER_ID_HERE",
    revenue: 99.99,
    currency: "USD",
    product_ids: ["SKU-001"],
    product_names: ["Product Name"]
  });

  // Identify the customer (links anonymous browsing to known identity)
  window.__odt.identify({
    email: "customer@example.com",
    customer_id: "CUST-123"
  });
</script>`;

    res.json({
      header_snippet: snippet,
      checkout_snippet: checkoutSnippet,
      site_token,
    });
  } catch (err) {
    console.error('Error generating snippet:', err);
    res.status(500).json({ error: 'Failed to generate snippet' });
  }
});

// ── GET /api/pixel-sites/:id/visitors — list visitors ────────

router.get('/:id/visitors', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const search = req.query.search as string;

    let whereClause = 'pv.user_id = $1 AND pv.site_id = $2 AND pv.canonical_id IS NULL';
    const params: any[] = [userId, id];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (pv.email ILIKE $${params.length} OR pv.anonymous_id ILIKE $${params.length} OR pv.customer_id ILIKE $${params.length})`;
    }

    params.push(limit, offset);
    const result = await pool.query(
      `SELECT pv.id, pv.anonymous_id, pv.email, pv.phone, pv.customer_id, pv.fingerprint,
              pv.first_seen_at, pv.last_seen_at, pv.total_sessions, pv.total_events, pv.total_revenue,
              pv.first_referrer, pv.first_landing
       FROM pixel_visitors pv
       WHERE ${whereClause}
       ORDER BY pv.last_seen_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM pixel_visitors pv WHERE ${whereClause}`,
      params.slice(0, -2),
    );

    res.json({
      visitors: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (err) {
    console.error('Error fetching visitors:', err);
    res.status(500).json({ error: 'Failed to fetch visitors' });
  }
});

// ── GET /api/pixel-sites/visitors/:visitorId/journey ─────────

router.get('/visitors/:visitorId/journey', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const visitorId = parseInt(req.params.visitorId);

    if (!visitorId) {
      res.status(400).json({ error: 'Invalid visitor ID' });
      return;
    }

    const journey = await getVisitorJourney(userId!, visitorId);

    if (!journey.visitor) {
      res.status(404).json({ error: 'Visitor not found' });
      return;
    }

    res.json(journey);
  } catch (err) {
    console.error('Error fetching visitor journey:', err);
    res.status(500).json({ error: 'Failed to fetch journey' });
  }
});

// ── GET /api/pixel-sites/stats — aggregate pixel stats ───────

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const days = parseInt(req.query.days as string) || 7;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const [visitors, sessions, events, topPages, topSources] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE canonical_id IS NULL) AS total_visitors,
           COUNT(*) FILTER (WHERE canonical_id IS NULL AND first_seen_at > $2) AS new_visitors,
           COUNT(*) FILTER (WHERE email IS NOT NULL AND canonical_id IS NULL) AS identified_visitors
         FROM pixel_visitors WHERE user_id = $1`,
        [userId, since],
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_sessions,
           COUNT(*) FILTER (WHERE is_bounce) AS bounced,
           COUNT(*) FILTER (WHERE has_conversion) AS converted,
           AVG(duration_ms) AS avg_duration
         FROM pixel_sessions WHERE user_id = $1 AND started_at > $2`,
        [userId, since],
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_events,
           COUNT(*) FILTER (WHERE event_name = 'PageView') AS pageviews,
           COUNT(*) FILTER (WHERE event_name = 'Purchase') AS purchases,
           COALESCE(SUM(revenue) FILTER (WHERE event_name = 'Purchase'), 0) AS total_revenue
         FROM pixel_events_v2 WHERE user_id = $1 AND created_at > $2`,
        [userId, since],
      ),
      pool.query(
        `SELECT page_url, COUNT(*) AS views
         FROM pixel_events_v2
         WHERE user_id = $1 AND event_name = 'PageView' AND created_at > $2
         GROUP BY page_url ORDER BY views DESC LIMIT 10`,
        [userId, since],
      ),
      pool.query(
        `SELECT platform, COUNT(*) AS touchpoints, COUNT(*) FILTER (WHERE converted) AS conversions,
                COALESCE(SUM(revenue) FILTER (WHERE converted), 0) AS revenue
         FROM pixel_touchpoints
         WHERE user_id = $1 AND touched_at > $2
         GROUP BY platform ORDER BY touchpoints DESC`,
        [userId, since],
      ),
    ]);

    res.json({
      visitors: visitors.rows[0],
      sessions: sessions.rows[0],
      events: events.rows[0],
      top_pages: topPages.rows,
      top_sources: topSources.rows,
    });
  } catch (err) {
    console.error('Error fetching pixel stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
