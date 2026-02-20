import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// Helper to get user_id filter
function userFilter(userId: number | null | undefined): { clause: string; params: any[] } {
  if (userId) return { clause: 'AND user_id = $1', params: [userId] };
  return { clause: '', params: [] };
}

// GET /api/analytics/timeseries?period=7d|30d|90d
router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const period = (req.query.period as string) || '7d';
    const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
    const userId = req.user?.id;

    // Get archived data grouped by day
    const uf = userId ? 'AND user_id = $2' : '';
    const params: any[] = [days];
    if (userId) params.push(userId);

    const result = await pool.query(`
      WITH ad_data AS (
        SELECT
          archived_date AS date,
          COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend,
          COALESCE(SUM((ad_data->>'clicks')::NUMERIC), 0) AS clicks,
          COALESCE(SUM((ad_data->>'impressions')::NUMERIC), 0) AS impressions
        FROM fb_ads_archive
        WHERE archived_date >= CURRENT_DATE - ($1 || ' days')::INTERVAL ${uf}
        GROUP BY archived_date
      ),
      order_data AS (
        SELECT
          archived_date AS date,
          COALESCE(SUM((order_data->>'revenue')::NUMERIC), 0) AS revenue,
          COUNT(*) AS conversions
        FROM orders_archive
        WHERE archived_date >= CURRENT_DATE - ($1 || ' days')::INTERVAL ${uf}
        GROUP BY archived_date
      )
      SELECT
        COALESCE(a.date, o.date) AS date,
        COALESCE(a.spend, 0) AS spend,
        COALESCE(o.revenue, 0) AS revenue,
        COALESCE(a.clicks, 0) AS clicks,
        COALESCE(a.impressions, 0) AS impressions,
        COALESCE(o.conversions, 0) AS conversions,
        CASE WHEN COALESCE(a.spend, 0) > 0 THEN COALESCE(o.revenue, 0) / a.spend ELSE 0 END AS roas
      FROM ad_data a
      FULL OUTER JOIN order_data o ON a.date = o.date
      ORDER BY date ASC
    `, params);

    // Also include today's data as the latest point
    const todayAdsQ = userId
      ? 'SELECT COALESCE(SUM(spend), 0) AS spend, COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(impressions), 0) AS impressions FROM fb_ads_today WHERE user_id = $1'
      : 'SELECT COALESCE(SUM(spend), 0) AS spend, COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(impressions), 0) AS impressions FROM fb_ads_today';
    const todayOrdersQ = userId
      ? "SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue, COUNT(DISTINCT order_id) AS conversions FROM cc_orders_today WHERE order_status = 'completed' AND user_id = $1"
      : "SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue, COUNT(DISTINCT order_id) AS conversions FROM cc_orders_today WHERE order_status = 'completed'";

    const [todayAds, todayOrders] = await Promise.all([
      pool.query(todayAdsQ, userId ? [userId] : []),
      pool.query(todayOrdersQ, userId ? [userId] : []),
    ]);

    const ta = todayAds.rows[0];
    const to = todayOrders.rows[0];
    const todaySpend = parseFloat(ta.spend) || 0;
    const todayRevenue = parseFloat(to.revenue) || 0;

    const rows = result.rows.map(r => ({
      date: r.date,
      spend: parseFloat(r.spend) || 0,
      revenue: parseFloat(r.revenue) || 0,
      clicks: parseInt(r.clicks) || 0,
      impressions: parseInt(r.impressions) || 0,
      conversions: parseInt(r.conversions) || 0,
      roas: parseFloat(r.roas) || 0,
    }));

    // Append today
    rows.push({
      date: new Date().toISOString().split('T')[0],
      spend: todaySpend,
      revenue: todayRevenue,
      clicks: parseInt(ta.clicks) || 0,
      impressions: parseInt(ta.impressions) || 0,
      conversions: parseInt(to.conversions) || 0,
      roas: todaySpend > 0 ? todayRevenue / todaySpend : 0,
    });

    res.json(rows);
  } catch (err) {
    console.error('Error fetching timeseries:', err);
    res.status(500).json({ error: 'Failed to fetch timeseries data' });
  }
});

// GET /api/analytics/breakdown?by=offer|account|campaign
router.get('/breakdown', async (req: Request, res: Response) => {
  try {
    const by = (req.query.by as string) || 'offer';
    const userId = req.user?.id;
    const uf = userId ? 'WHERE user_id = $1' : '';
    const ufAnd = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    let result;
    if (by === 'account') {
      result = await pool.query(`
        SELECT
          account_name AS label,
          SUM(spend) AS spend,
          SUM(clicks) AS clicks,
          SUM(impressions) AS impressions
        FROM fb_ads_today ${uf}
        GROUP BY account_name ORDER BY spend DESC
      `, params);
    } else if (by === 'campaign') {
      result = await pool.query(`
        SELECT
          campaign_name AS label,
          SUM(spend) AS spend,
          SUM(clicks) AS clicks,
          SUM(impressions) AS impressions
        FROM fb_ads_today ${uf}
        GROUP BY campaign_name ORDER BY spend DESC LIMIT 20
      `, params);
    } else {
      // by offer
      result = await pool.query(`
        SELECT
          offer_name AS label,
          SUM(COALESCE(subtotal, revenue)) AS revenue,
          COUNT(DISTINCT order_id) AS conversions
        FROM cc_orders_today
        WHERE order_status = 'completed' ${ufAnd}
        GROUP BY offer_name ORDER BY revenue DESC
      `, params);
    }

    res.json(result.rows.map(r => ({
      label: r.label,
      spend: parseFloat(r.spend) || 0,
      revenue: parseFloat(r.revenue) || 0,
      clicks: parseInt(r.clicks) || 0,
      impressions: parseInt(r.impressions) || 0,
      conversions: parseInt(r.conversions) || 0,
    })));
  } catch (err) {
    console.error('Error fetching breakdown:', err);
    res.status(500).json({ error: 'Failed to fetch breakdown' });
  }
});

// GET /api/analytics/funnel
router.get('/funnel', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const uf = userId ? 'WHERE user_id = $1' : '';
    const ufAnd = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const [adsResult, ordersResult, upsellsResult] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(impressions), 0) AS impressions,
          COALESCE(SUM(clicks), 0) AS clicks,
          COALESCE(SUM(landing_page_views), 0) AS lp_views
        FROM fb_ads_today ${uf}
      `, params),
      pool.query(`
        SELECT COUNT(DISTINCT order_id) AS orders
        FROM cc_orders_today
        WHERE order_status = 'completed' ${ufAnd}
      `, params),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE offered) AS upsells_offered,
          COUNT(*) FILTER (WHERE accepted) AS upsells_accepted
        FROM cc_upsells_today ${uf}
      `, params),
    ]);

    const ads = adsResult.rows[0];
    const orders = ordersResult.rows[0];
    const upsells = upsellsResult.rows[0];

    res.json({
      impressions: parseInt(ads.impressions) || 0,
      clicks: parseInt(ads.clicks) || 0,
      lp_views: parseInt(ads.lp_views) || 0,
      orders: parseInt(orders.orders) || 0,
      upsells_offered: parseInt(upsells.upsells_offered) || 0,
      upsells_accepted: parseInt(upsells.upsells_accepted) || 0,
    });
  } catch (err) {
    console.error('Error fetching funnel:', err);
    res.status(500).json({ error: 'Failed to fetch funnel data' });
  }
});

// GET /api/analytics/source-medium — real UTM-based source/medium breakdown
router.get('/source-medium', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const dateRange = (req.query.dateRange as string) || 'today';
    const ufAnd = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    let query: string;

    if (dateRange === 'today' || dateRange === '1d') {
      query = `
        SELECT
          COALESCE(NULLIF(utm_source, ''), 'direct') AS utm_source,
          COALESCE(NULLIF(utm_medium, ''), '(none)') AS utm_medium,
          COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue,
          COUNT(DISTINCT order_id) AS conversions,
          COUNT(*) AS orders
        FROM cc_orders_today
        WHERE order_status = 'completed' ${ufAnd}
        GROUP BY utm_source, utm_medium
        ORDER BY revenue DESC
      `;
    } else {
      // For date ranges > today, UNION with orders_archive
      const days = dateRange === '30d' ? 30 : dateRange === '7d' ? 7 : 90;
      const ufArchive = userId ? 'AND user_id = $1' : '';
      query = `
        WITH combined AS (
          SELECT utm_source, utm_medium, COALESCE(subtotal, revenue) AS revenue, order_id
          FROM cc_orders_today
          WHERE order_status = 'completed' ${ufAnd}
          UNION ALL
          SELECT
            order_data->>'utm_source' AS utm_source,
            order_data->>'utm_medium' AS utm_medium,
            (order_data->>'revenue')::NUMERIC AS revenue,
            order_data->>'order_id' AS order_id
          FROM orders_archive
          WHERE archived_date >= CURRENT_DATE - INTERVAL '${days} days' ${ufArchive}
        )
        SELECT
          COALESCE(NULLIF(utm_source, ''), 'direct') AS utm_source,
          COALESCE(NULLIF(utm_medium, ''), '(none)') AS utm_medium,
          COALESCE(SUM(revenue), 0) AS revenue,
          COUNT(DISTINCT order_id) AS conversions,
          COUNT(*) AS orders
        FROM combined
        GROUP BY utm_source, utm_medium
        ORDER BY revenue DESC
      `;
    }

    const result = await pool.query(query, params);

    res.json(result.rows.map(r => ({
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      revenue: parseFloat(r.revenue) || 0,
      conversions: parseInt(r.conversions) || 0,
      orders: parseInt(r.orders) || 0,
    })));
  } catch (err) {
    console.error('Error fetching source/medium:', err);
    res.status(500).json({ error: 'Failed to fetch source/medium data' });
  }
});

// GET /api/analytics/pnl — Profit & Loss summary
router.get('/pnl', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const uf = userId ? 'WHERE user_id = $1' : '';
    const ufAnd = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    const [adSpendResult, revenueResult, costsResult] = await Promise.all([
      pool.query(`
        SELECT COALESCE(SUM(spend), 0) AS total_spend
        FROM fb_ads_today ${uf}
      `, params),
      pool.query(`
        SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS total_revenue
        FROM cc_orders_today
        WHERE order_status = 'completed' ${ufAnd}
      `, params),
      pool.query(`
        SELECT COALESCE(SUM(cost_value), 0) AS total_cogs
        FROM cost_settings ${uf}
      `, params),
    ]);

    const adSpend = parseFloat(adSpendResult.rows[0].total_spend) || 0;
    const revenue = parseFloat(revenueResult.rows[0].total_revenue) || 0;
    const cogs = parseFloat(costsResult.rows[0].total_cogs) || 0;
    const netProfit = revenue - adSpend - cogs;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    res.json({
      revenue,
      adSpend,
      cogs,
      netProfit,
      margin: parseFloat(margin.toFixed(2)),
    });
  } catch (err) {
    console.error('Error fetching P&L:', err);
    res.status(500).json({ error: 'Failed to fetch P&L data' });
  }
});

export default router;
