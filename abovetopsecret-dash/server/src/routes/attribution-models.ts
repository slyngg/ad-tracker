import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

const MODELS = [
  { id: 'first_click', name: 'First Click', description: 'All credit to the first touchpoint' },
  { id: 'last_click', name: 'Last Click', description: 'All credit to the last touchpoint' },
  { id: 'linear', name: 'Linear', description: 'Credit split equally across all touchpoints' },
  { id: 'time_decay', name: 'Time Decay', description: 'More credit to recent touchpoints' },
];

// GET /api/attribution/models
router.get('/models', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const config = await pool.query('SELECT * FROM attribution_config WHERE user_id = $1', [userId]);
    res.json({
      models: MODELS,
      default_model: config.rows[0]?.default_model || 'last_click',
      lookback_window: config.rows[0]?.lookback_window || 30,
    });
  } catch (err) {
    console.error('Error fetching attribution models:', err);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// POST /api/attribution/config
router.post('/config', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { default_model, lookback_window } = req.body;
    await pool.query(`
      INSERT INTO attribution_config (user_id, default_model, lookback_window, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE SET default_model = EXCLUDED.default_model, lookback_window = EXCLUDED.lookback_window, updated_at = NOW()
    `, [userId, default_model || 'last_click', lookback_window || 30]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving attribution config:', err);
    res.status(500).json({ error: 'Failed to save config' });
  }
});

// GET /api/attribution/data?model=last_click&startDate=30
router.get('/data', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const model = (req.query.model as string) || 'last_click';
    const uf = userId ? 'WHERE user_id = $1' : '';
    const ufAnd = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    // Multi-platform: UNION all ad tables, resolve account names via LEFT JOIN
    const result = await pool.query(`
      WITH ad_metrics AS (
        SELECT source, SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::NUMERIC / SUM(impressions) * 100 ELSE 0 END AS ctr,
          CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc,
          CASE WHEN SUM(impressions) > 0 THEN SUM(spend) / SUM(impressions) * 1000 ELSE 0 END AS cpm
        FROM (
          SELECT account_name AS source, spend, clicks, impressions FROM fb_ads_today ${uf}
          UNION ALL
          SELECT a.name AS source, t.spend, t.clicks, t.impressions
          FROM tiktok_ads_today t LEFT JOIN accounts a ON a.id = t.account_id ${uf.replace('WHERE', 'WHERE t.')}
          UNION ALL
          SELECT a.name AS source, n.spend, n.clicks, n.impressions
          FROM newsbreak_ads_today n LEFT JOIN accounts a ON a.platform = 'newsbreak' AND a.user_id = n.user_id ${uf.replace('WHERE', 'WHERE n.')}
        ) all_ads
        GROUP BY source
      ),
      order_metrics AS (
        SELECT
          COALESCE(NULLIF(utm_source, ''), 'direct') AS source,
          COUNT(DISTINCT order_id) AS purchases,
          SUM(COALESCE(subtotal, revenue)) AS revenue,
          COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS new_customer_orders
        FROM cc_orders_today
        WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${ufAnd}
        GROUP BY utm_source
      )
      SELECT
        COALESCE(a.source, o.source) AS source,
        COALESCE(a.spend, 0) AS spend,
        COALESCE(a.spend, 0) AS budget,
        COALESCE(o.purchases, 0) AS purchases,
        COALESCE(o.revenue, 0) AS revenue,
        CASE WHEN COALESCE(a.spend, 0) > 0 THEN COALESCE(o.revenue, 0) / a.spend ELSE 0 END AS roas,
        CASE WHEN COALESCE(o.purchases, 0) > 0 THEN COALESCE(a.spend, 0) / o.purchases ELSE 0 END AS cpa,
        CASE WHEN COALESCE(o.new_customer_orders, 0) > 0 THEN COALESCE(a.spend, 0) / o.new_customer_orders ELSE 0 END AS nc_cpa,
        CASE WHEN COALESCE(a.spend, 0) > 0 AND COALESCE(o.new_customer_orders, 0) > 0
          THEN (SELECT SUM(COALESCE(subtotal, revenue)) FROM cc_orders_today WHERE new_customer AND (is_test = false OR is_test IS NULL) AND utm_source = COALESCE(a.source, o.source) ${ufAnd}) / a.spend
          ELSE 0 END AS nc_roas,
        COALESCE(a.clicks, 0) AS clicks,
        COALESCE(a.impressions, 0) AS impressions,
        COALESCE(a.ctr, 0) AS ctr,
        COALESCE(a.cpm, 0) AS cpm,
        COALESCE(a.cpc, 0) AS cpc
      FROM ad_metrics a
      FULL OUTER JOIN order_metrics o ON LOWER(a.source) = LOWER(o.source)
      ORDER BY spend DESC
    `, params);

    res.json({ model, data: result.rows });
  } catch (err) {
    console.error('Error fetching attribution data:', err);
    res.status(500).json({ error: 'Failed to fetch attribution data' });
  }
});

// GET /api/attribution/ads — ad-level performance data across platforms
router.get('/ads', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const uf = userId ? 'WHERE user_id = $1' : '';
    const params = userId ? [userId] : [];

    const result = await pool.query(`
      SELECT
        'newsbreak' AS platform,
        ad_id, ad_name, campaign_name, adset_name,
        spend AS cost, impressions, cpm, clicks, cpc, ctr, conversions, cpa,
        COALESCE(cvr, 0) AS cvr,
        conversion_value AS total_conversion_value,
        CASE WHEN conversions > 0 THEN conversion_value / conversions ELSE 0 END AS value_per_conversion,
        synced_at
      FROM newsbreak_ads_today ${uf}
      UNION ALL
      SELECT
        'meta' AS platform,
        id::TEXT AS ad_id, ad_name, campaign_name, ad_set_name AS adset_name,
        spend AS cost, impressions,
        CASE WHEN impressions > 0 THEN spend / impressions * 1000 ELSE 0 END AS cpm,
        clicks,
        CASE WHEN clicks > 0 THEN spend / clicks ELSE 0 END AS cpc,
        CASE WHEN impressions > 0 THEN clicks::NUMERIC / impressions ELSE 0 END AS ctr,
        0 AS conversions, 0 AS cpa, 0 AS cvr,
        0 AS total_conversion_value, 0 AS value_per_conversion,
        synced_at
      FROM fb_ads_today ${uf}
      UNION ALL
      SELECT
        'tiktok' AS platform,
        ad_id, ad_name, campaign_name, adgroup_name AS adset_name,
        spend AS cost, impressions, cpm, clicks, cpc, ctr,
        COALESCE(conversions, 0) AS conversions,
        CASE WHEN COALESCE(conversions, 0) > 0 THEN spend / conversions ELSE 0 END AS cpa,
        CASE WHEN clicks > 0 THEN COALESCE(conversions, 0)::NUMERIC / clicks ELSE 0 END AS cvr,
        COALESCE(conversion_value, 0) AS total_conversion_value,
        CASE WHEN COALESCE(conversions, 0) > 0 THEN COALESCE(conversion_value, 0) / conversions ELSE 0 END AS value_per_conversion,
        synced_at
      FROM tiktok_ads_today ${uf}
      ORDER BY cost DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching ad-level data:', err);
    res.status(500).json({ error: 'Failed to fetch ad data' });
  }
});

// GET /api/attribution/overlap — channel overlap
router.get('/overlap', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const uf = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];

    // Get orders with multiple UTM sources (indicating multi-channel paths)
    const result = await pool.query(`
      SELECT
        COALESCE(NULLIF(utm_source, ''), 'direct') AS channel,
        COUNT(DISTINCT order_id) AS orders
      FROM cc_orders_today
      WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${uf}
      GROUP BY utm_source
      ORDER BY orders DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching channel overlap:', err);
    res.status(500).json({ error: 'Failed to fetch overlap data' });
  }
});

export default router;
