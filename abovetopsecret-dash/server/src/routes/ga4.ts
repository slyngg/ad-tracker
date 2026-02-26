import { Router, Request, Response } from 'express';
import pool from '../db';
import { syncGA4Data } from '../services/ga4-sync';
import { testGA4Connection } from '../services/ga4-client';
import { getSetting } from '../services/settings';

const router = Router();

// GET /api/ga4/overview — combined key metrics for dashboard
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const uf = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const result = await pool.query(`
      SELECT
        COALESCE(SUM(sessions), 0) AS total_sessions,
        COALESCE(SUM(users_count), 0) AS total_users,
        COALESCE(SUM(new_users), 0) AS total_new_users,
        COALESCE(SUM(pageviews), 0) AS total_pageviews,
        COALESCE(SUM(conversions), 0) AS total_conversions,
        COALESCE(SUM(add_to_carts), 0) AS total_add_to_carts,
        COALESCE(SUM(revenue), 0) AS total_revenue,
        CASE WHEN SUM(sessions) > 0 THEN AVG(pages_per_session) ELSE 0 END AS avg_pages_per_session,
        CASE WHEN SUM(sessions) > 0 THEN AVG(avg_session_duration) ELSE 0 END AS avg_session_duration,
        CASE WHEN SUM(sessions) > 0 THEN AVG(bounce_rate) ELSE 0 END AS avg_bounce_rate,
        CASE WHEN SUM(sessions) > 0 THEN SUM(conversions)::NUMERIC / SUM(sessions) ELSE 0 END AS conversion_rate
      FROM ga4_sessions
      WHERE date >= CURRENT_DATE - INTERVAL '30 days' ${uf}
    `, params);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[GA4] Overview error:', err);
    res.status(500).json({ error: 'Failed to fetch GA4 overview' });
  }
});

// GET /api/ga4/sessions — sessions data with grouping
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate, groupBy } = req.query;
    const start = (startDate as string) || '30';
    const end = (endDate as string) || 'today';
    const group = (groupBy as string) || 'date';
    const uf = userId ? 'AND user_id = $1' : '';
    const params: any[] = userId ? [userId] : [];

    const groupCol = ['source', 'device_category', 'country', 'landing_page'].includes(group) ? group : 'date';
    const days = parseInt(start) || 30;
    params.push(days);
    const daysParam = `$${params.length}`;

    const result = await pool.query(`
      SELECT
        ${groupCol} AS group_key,
        SUM(sessions) AS sessions,
        SUM(users_count) AS users,
        SUM(new_users) AS new_users,
        SUM(pageviews) AS pageviews,
        AVG(pages_per_session) AS pages_per_session,
        AVG(avg_session_duration) AS avg_session_duration,
        AVG(bounce_rate) AS bounce_rate,
        SUM(conversions) AS conversions,
        SUM(revenue) AS revenue,
        SUM(add_to_carts) AS add_to_carts
      FROM ga4_sessions
      WHERE date >= CURRENT_DATE - (${daysParam} || ' days')::INTERVAL ${uf}
      GROUP BY ${groupCol}
      ORDER BY ${groupCol === 'date' ? 'group_key ASC' : 'sessions DESC'}
      LIMIT 100
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('[GA4] Sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch GA4 sessions' });
  }
});

// GET /api/ga4/pages — page-level data
router.get('/pages', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, sort } = req.query;
    const start = (startDate as string) || '30';
    const sortCol = ['pageviews', 'sessions', 'revenue', 'conversions', 'avg_time_on_page'].includes(sort as string) ? sort : 'pageviews';
    const uf = userId ? 'AND user_id = $1' : '';
    const params: any[] = userId ? [userId] : [];
    const days = parseInt(start) || 30;
    params.push(days);
    const daysParam = `$${params.length}`;

    const result = await pool.query(`
      SELECT
        page_path,
        MAX(page_title) AS page_title,
        SUM(sessions) AS sessions,
        SUM(pageviews) AS pageviews,
        AVG(avg_time_on_page) AS avg_time_on_page,
        SUM(conversions) AS conversions,
        CASE WHEN SUM(sessions) > 0 THEN SUM(conversions)::NUMERIC / SUM(sessions) ELSE 0 END AS conversion_rate,
        SUM(revenue) AS revenue
      FROM ga4_pages
      WHERE date >= CURRENT_DATE - (${daysParam} || ' days')::INTERVAL ${uf}
      GROUP BY page_path
      ORDER BY ${sortCol} DESC
      LIMIT 50
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('[GA4] Pages error:', err);
    res.status(500).json({ error: 'Failed to fetch GA4 pages' });
  }
});

// GET /api/ga4/search — site search data
router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate } = req.query;
    const start = (startDate as string) || '30';
    const uf = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const days = parseInt(start) || 30;
    params.push(days);
    const daysParam = `$${params.length}`;

    const result = await pool.query(`
      SELECT
        search_term,
        SUM(search_count) AS total_searches,
        SUM(search_exits) AS total_exits,
        SUM(conversions_after_search) AS conversions,
        SUM(revenue_after_search) AS revenue,
        CASE WHEN SUM(search_count) > 0 THEN SUM(conversions_after_search)::NUMERIC / SUM(search_count) ELSE 0 END AS conversion_rate
      FROM ga4_search_queries
      WHERE date >= CURRENT_DATE - (${daysParam} || ' days')::INTERVAL ${uf}
      GROUP BY search_term
      ORDER BY total_searches DESC
      LIMIT 50
    `, params);

    // Also get daily totals for chart
    const dailyResult = await pool.query(`
      SELECT date, SUM(search_count) AS searches
      FROM ga4_search_queries
      WHERE date >= CURRENT_DATE - (${daysParam} || ' days')::INTERVAL ${uf}
      GROUP BY date ORDER BY date ASC
    `, params);

    res.json({ queries: result.rows, daily: dailyResult.rows });
  } catch (err) {
    console.error('[GA4] Search error:', err);
    res.status(500).json({ error: 'Failed to fetch GA4 search data' });
  }
});

// GET /api/ga4/funnel — conversion funnel
router.get('/funnel', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate } = req.query;
    const start = (startDate as string) || '30';
    const uf = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const days = parseInt(start) || 30;
    params.push(days);
    const daysParam = `$${params.length}`;

    const result = await pool.query(`
      SELECT
        event_name,
        SUM(event_count) AS total_events,
        SUM(unique_users) AS unique_users
      FROM ga4_funnel_events
      WHERE date >= CURRENT_DATE - (${daysParam} || ' days')::INTERVAL ${uf}
        AND event_name IN ('page_view', 'add_to_cart', 'begin_checkout', 'purchase')
      GROUP BY event_name
    `, params);

    // Also get by device
    const deviceResult = await pool.query(`
      SELECT
        event_name,
        device_category,
        SUM(event_count) AS total_events
      FROM ga4_funnel_events
      WHERE date >= CURRENT_DATE - (${daysParam} || ' days')::INTERVAL ${uf}
        AND event_name IN ('page_view', 'add_to_cart', 'begin_checkout', 'purchase')
      GROUP BY event_name, device_category
    `, params);

    res.json({ funnel: result.rows, byDevice: deviceResult.rows });
  } catch (err) {
    console.error('[GA4] Funnel error:', err);
    res.status(500).json({ error: 'Failed to fetch GA4 funnel data' });
  }
});

// GET /api/ga4/products — product analytics
router.get('/products', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { startDate, sort } = req.query;
    const start = (startDate as string) || '30';
    const sortCol = ['revenue', 'purchases', 'views', 'add_to_carts'].includes(sort as string) ? sort : 'revenue';
    const uf = userId ? 'AND user_id = $1' : '';
    const params: any[] = userId ? [userId] : [];
    const days = parseInt(start) || 30;
    params.push(days);
    const daysParam = `$${params.length}`;

    const result = await pool.query(`
      SELECT
        product_name,
        product_id,
        MAX(product_category) AS category,
        SUM(views) AS views,
        SUM(add_to_carts) AS add_to_carts,
        SUM(purchases) AS purchases,
        SUM(revenue) AS revenue,
        CASE WHEN SUM(add_to_carts) > 0 THEN SUM(purchases)::NUMERIC / SUM(add_to_carts) ELSE 0 END AS cart_to_purchase_rate,
        CASE WHEN SUM(purchases) > 0 THEN SUM(revenue) / SUM(purchases) ELSE 0 END AS avg_price
      FROM ga4_products
      WHERE date >= CURRENT_DATE - (${daysParam} || ' days')::INTERVAL ${uf}
      GROUP BY product_name, product_id
      ORDER BY ${sortCol} DESC
      LIMIT 100
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('[GA4] Products error:', err);
    res.status(500).json({ error: 'Failed to fetch GA4 product data' });
  }
});

// POST /api/ga4/sync — manual sync trigger
router.post('/sync', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const result = await syncGA4Data(userId ?? undefined);
    res.json(result);
  } catch (err) {
    console.error('[GA4] Sync error:', err);
    res.status(500).json({ error: 'GA4 sync failed' });
  }
});

// POST /api/ga4/test — test connection
router.post('/test', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const credentialsJson = await getSetting('ga4_credentials_json', userId);
    const propertyId = await getSetting('ga4_property_id', userId);

    if (!credentialsJson || !propertyId) {
      return res.json({ success: false, error: 'GA4 credentials or property ID not configured' });
    }

    const result = await testGA4Connection(credentialsJson, propertyId);
    res.json(result);
  } catch (err) {
    console.error('[GA4] Test error:', err);
    res.status(500).json({ success: false, error: 'Connection test failed' });
  }
});

export default router;
