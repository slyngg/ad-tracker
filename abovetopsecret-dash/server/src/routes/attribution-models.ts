import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

const MODELS = [
  { id: 'first_click', name: 'First Click', description: 'All credit to the first touchpoint' },
  { id: 'last_click', name: 'Last Click', description: 'All credit to the last touchpoint' },
  { id: 'linear', name: 'Linear', description: 'Credit split equally across all touchpoints' },
  { id: 'time_decay', name: 'Time Decay', description: 'More credit to recent touchpoints' },
];

/** Parse optional start_date / end_date query params. Returns null if "today" (no dates). */
function parseDateRange(query: Record<string, any>): { startDate: string; endDate: string } | null {
  const s = query.start_date as string | undefined;
  const e = query.end_date as string | undefined;
  if (!s || !e) return null;
  // Basic validation: must look like YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return null;
  const today = new Date().toISOString().split('T')[0];
  if (s === today && e === today) return null; // same as "today"
  return { startDate: s, endDate: e };
}

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

// GET /api/attribution/data?model=last_click&start_date=2026-02-01&end_date=2026-02-25
router.get('/data', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const model = (req.query.model as string) || 'last_click';
    const range = parseDateRange(req.query as Record<string, any>);

    if (range && userId) {
      // Historical: query archive tables
      const params = [userId, range.startDate, range.endDate];

      const result = await pool.query(`
        WITH ad_metrics AS (
          SELECT source, SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
            SUM(platform_conversions) AS platform_conversions,
            SUM(platform_revenue) AS platform_revenue,
            CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::NUMERIC / SUM(impressions) * 100 ELSE 0 END AS ctr,
            CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc,
            CASE WHEN SUM(impressions) > 0 THEN SUM(spend) / SUM(impressions) * 1000 ELSE 0 END AS cpm
          FROM (
            SELECT ad_data->>'account_name' AS source,
              (ad_data->>'spend')::NUMERIC AS spend,
              (ad_data->>'clicks')::NUMERIC AS clicks,
              (ad_data->>'impressions')::NUMERIC AS impressions,
              0::NUMERIC AS platform_conversions, 0::NUMERIC AS platform_revenue
            FROM fb_ads_archive WHERE user_id = $1 AND archived_date BETWEEN $2 AND $3
            UNION ALL
            SELECT COALESCE(a.name, 'TikTok') AS source,
              (t.ad_data->>'spend')::NUMERIC, (t.ad_data->>'clicks')::NUMERIC, (t.ad_data->>'impressions')::NUMERIC,
              COALESCE((t.ad_data->>'conversions')::NUMERIC, 0), COALESCE((t.ad_data->>'conversion_value')::NUMERIC, 0)
            FROM tiktok_ads_archive t LEFT JOIN accounts a ON a.id = t.account_id
            WHERE t.user_id = $1 AND t.archived_date BETWEEN $2 AND $3
            UNION ALL
            SELECT COALESCE(a.name, 'NewsBreak') AS source,
              (n.ad_data->>'spend')::NUMERIC, (n.ad_data->>'clicks')::NUMERIC, (n.ad_data->>'impressions')::NUMERIC,
              COALESCE((n.ad_data->>'conversions')::NUMERIC, 0), COALESCE((n.ad_data->>'conversion_value')::NUMERIC, 0)
            FROM newsbreak_ads_archive n LEFT JOIN accounts a ON a.platform_account_id = n.account_id AND a.user_id = n.user_id AND a.status = 'active'
            WHERE n.user_id = $1 AND n.archived_date BETWEEN $2 AND $3
          ) all_ads
          GROUP BY source
        ),
        order_metrics AS (
          SELECT
            COALESCE(NULLIF(source_field, ''), 'direct') AS source,
            COUNT(DISTINCT oid) AS purchases,
            SUM(rev) AS revenue,
            COUNT(DISTINCT CASE WHEN is_new THEN oid END) AS new_customer_orders
          FROM (
            SELECT order_data->>'utm_source' AS source_field, order_data->>'order_id' AS oid,
              COALESCE((order_data->>'subtotal')::NUMERIC, (order_data->>'revenue')::NUMERIC) AS rev,
              COALESCE((order_data->>'new_customer')::BOOLEAN, false) AS is_new
            FROM orders_archive
            WHERE archived_date BETWEEN $2 AND $3
              AND order_data->>'order_status' = 'completed'
              AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
              AND user_id = $1
          ) o
          GROUP BY source_field
        )
        SELECT
          COALESCE(a.source, o.source) AS source,
          COALESCE(a.spend, 0) AS spend,
          COALESCE(a.spend, 0) AS budget,
          GREATEST(COALESCE(o.purchases, 0), COALESCE(a.platform_conversions, 0)) AS purchases,
          GREATEST(COALESCE(o.revenue, 0), COALESCE(a.platform_revenue, 0)) AS revenue,
          CASE WHEN COALESCE(a.spend, 0) > 0 THEN GREATEST(COALESCE(o.revenue, 0), COALESCE(a.platform_revenue, 0)) / a.spend ELSE 0 END AS roas,
          CASE WHEN GREATEST(COALESCE(o.purchases, 0), COALESCE(a.platform_conversions, 0)) > 0 THEN COALESCE(a.spend, 0) / GREATEST(COALESCE(o.purchases, 0), COALESCE(a.platform_conversions, 0)) ELSE 0 END AS cpa,
          CASE WHEN COALESCE(o.new_customer_orders, 0) > 0 THEN COALESCE(a.spend, 0) / o.new_customer_orders ELSE 0 END AS nc_cpa,
          CASE WHEN COALESCE(a.spend, 0) > 0 AND COALESCE(o.new_customer_orders, 0) > 0
            THEN (SELECT SUM(COALESCE((order_data->>'subtotal')::NUMERIC, (order_data->>'revenue')::NUMERIC))
                  FROM orders_archive WHERE user_id = $1 AND archived_date BETWEEN $2 AND $3
                    AND COALESCE((order_data->>'new_customer')::BOOLEAN, false) = true
                    AND order_data->>'order_status' = 'completed'
                    AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
                    AND order_data->>'utm_source' = COALESCE(a.source, o.source)) / a.spend
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
    } else {
      // Today: use live *_today tables (original query)
      const uf = userId ? 'WHERE user_id = $1' : '';
      const ufAnd = userId ? 'AND user_id = $1' : '';
      const params = userId ? [userId] : [];

      const result = await pool.query(`
        WITH ad_metrics AS (
          SELECT source, SUM(spend) AS spend, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
            SUM(platform_conversions) AS platform_conversions,
            SUM(platform_revenue) AS platform_revenue,
            CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::NUMERIC / SUM(impressions) * 100 ELSE 0 END AS ctr,
            CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END AS cpc,
            CASE WHEN SUM(impressions) > 0 THEN SUM(spend) / SUM(impressions) * 1000 ELSE 0 END AS cpm
          FROM (
            SELECT account_name AS source, spend, clicks, impressions, 0::NUMERIC AS platform_conversions, 0::NUMERIC AS platform_revenue FROM fb_ads_today ${uf}
            UNION ALL
            SELECT COALESCE(a.name, 'TikTok') AS source, t.spend, t.clicks, t.impressions, COALESCE(t.conversions, 0)::NUMERIC, COALESCE(t.conversion_value, 0)::NUMERIC
            FROM tiktok_ads_today t LEFT JOIN accounts a ON a.id = t.account_id ${uf.replace('WHERE', 'WHERE t.')}
            UNION ALL
            SELECT COALESCE(a.name, 'NewsBreak') AS source, n.spend, n.clicks, n.impressions, COALESCE(n.conversions, 0)::NUMERIC, COALESCE(n.conversion_value, 0)::NUMERIC
            FROM newsbreak_ads_today n LEFT JOIN accounts a ON a.platform_account_id = n.account_id AND a.user_id = n.user_id AND a.status = 'active' ${uf.replace('WHERE', 'WHERE n.')}
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
          GREATEST(COALESCE(o.purchases, 0), COALESCE(a.platform_conversions, 0)) AS purchases,
          GREATEST(COALESCE(o.revenue, 0), COALESCE(a.platform_revenue, 0)) AS revenue,
          CASE WHEN COALESCE(a.spend, 0) > 0 THEN GREATEST(COALESCE(o.revenue, 0), COALESCE(a.platform_revenue, 0)) / a.spend ELSE 0 END AS roas,
          CASE WHEN GREATEST(COALESCE(o.purchases, 0), COALESCE(a.platform_conversions, 0)) > 0 THEN COALESCE(a.spend, 0) / GREATEST(COALESCE(o.purchases, 0), COALESCE(a.platform_conversions, 0)) ELSE 0 END AS cpa,
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
    }
  } catch (err) {
    console.error('Error fetching attribution data:', err);
    res.status(500).json({ error: 'Failed to fetch attribution data' });
  }
});

// GET /api/attribution/ads — ad-level performance data across platforms
router.get('/ads', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const range = parseDateRange(req.query as Record<string, any>);

    if (range && userId) {
      // Historical: query archive tables
      const params = [userId, range.startDate, range.endDate];

      const result = await pool.query(`
        SELECT
          'newsbreak' AS platform,
          n.ad_data->>'ad_id' AS ad_id, n.ad_data->>'ad_name' AS ad_name,
          n.ad_data->>'campaign_name' AS campaign_name, n.ad_data->>'adset_name' AS adset_name,
          (n.ad_data->>'spend')::NUMERIC AS cost, (n.ad_data->>'impressions')::NUMERIC AS impressions,
          (n.ad_data->>'cpm')::NUMERIC AS cpm, (n.ad_data->>'clicks')::NUMERIC AS clicks,
          (n.ad_data->>'cpc')::NUMERIC AS cpc, (n.ad_data->>'ctr')::NUMERIC AS ctr,
          COALESCE((n.ad_data->>'conversions')::NUMERIC, 0) AS conversions,
          (n.ad_data->>'cpa')::NUMERIC AS cpa,
          COALESCE((n.ad_data->>'cvr')::NUMERIC, 0) AS cvr,
          COALESCE((n.ad_data->>'conversion_value')::NUMERIC, 0) AS total_conversion_value,
          CASE WHEN COALESCE((n.ad_data->>'conversions')::NUMERIC, 0) > 0
            THEN COALESCE((n.ad_data->>'conversion_value')::NUMERIC, 0) / (n.ad_data->>'conversions')::NUMERIC ELSE 0 END AS value_per_conversion,
          n.created_at AS synced_at,
          COALESCE(a.name, 'NewsBreak') AS account_name
        FROM newsbreak_ads_archive n LEFT JOIN accounts a ON a.platform_account_id = n.account_id AND a.user_id = n.user_id AND a.status = 'active'
        WHERE n.user_id = $1 AND n.archived_date BETWEEN $2 AND $3
        UNION ALL
        SELECT
          'meta' AS platform,
          ad_data->>'id' AS ad_id, ad_data->>'ad_name' AS ad_name,
          ad_data->>'campaign_name' AS campaign_name, ad_data->>'ad_set_name' AS adset_name,
          (ad_data->>'spend')::NUMERIC AS cost, (ad_data->>'impressions')::NUMERIC AS impressions,
          CASE WHEN (ad_data->>'impressions')::NUMERIC > 0 THEN (ad_data->>'spend')::NUMERIC / (ad_data->>'impressions')::NUMERIC * 1000 ELSE 0 END AS cpm,
          (ad_data->>'clicks')::NUMERIC AS clicks,
          CASE WHEN (ad_data->>'clicks')::NUMERIC > 0 THEN (ad_data->>'spend')::NUMERIC / (ad_data->>'clicks')::NUMERIC ELSE 0 END AS cpc,
          CASE WHEN (ad_data->>'impressions')::NUMERIC > 0 THEN (ad_data->>'clicks')::NUMERIC / (ad_data->>'impressions')::NUMERIC ELSE 0 END AS ctr,
          0 AS conversions, 0 AS cpa, 0 AS cvr,
          0 AS total_conversion_value, 0 AS value_per_conversion,
          archived_at AS synced_at,
          ad_data->>'account_name' AS account_name
        FROM fb_ads_archive WHERE user_id = $1 AND archived_date BETWEEN $2 AND $3
        UNION ALL
        SELECT
          'tiktok' AS platform,
          t.ad_data->>'ad_id' AS ad_id, t.ad_data->>'ad_name' AS ad_name,
          t.ad_data->>'campaign_name' AS campaign_name, t.ad_data->>'adgroup_name' AS adset_name,
          (t.ad_data->>'spend')::NUMERIC AS cost, (t.ad_data->>'impressions')::NUMERIC AS impressions,
          (t.ad_data->>'cpm')::NUMERIC AS cpm, (t.ad_data->>'clicks')::NUMERIC AS clicks,
          (t.ad_data->>'cpc')::NUMERIC AS cpc, (t.ad_data->>'ctr')::NUMERIC AS ctr,
          COALESCE((t.ad_data->>'conversions')::NUMERIC, 0) AS conversions,
          CASE WHEN COALESCE((t.ad_data->>'conversions')::NUMERIC, 0) > 0 THEN (t.ad_data->>'spend')::NUMERIC / (t.ad_data->>'conversions')::NUMERIC ELSE 0 END AS cpa,
          CASE WHEN (t.ad_data->>'clicks')::NUMERIC > 0 THEN COALESCE((t.ad_data->>'conversions')::NUMERIC, 0) / (t.ad_data->>'clicks')::NUMERIC ELSE 0 END AS cvr,
          COALESCE((t.ad_data->>'conversion_value')::NUMERIC, 0) AS total_conversion_value,
          CASE WHEN COALESCE((t.ad_data->>'conversions')::NUMERIC, 0) > 0 THEN COALESCE((t.ad_data->>'conversion_value')::NUMERIC, 0) / (t.ad_data->>'conversions')::NUMERIC ELSE 0 END AS value_per_conversion,
          t.created_at AS synced_at,
          COALESCE(ta.name, 'TikTok') AS account_name
        FROM tiktok_ads_archive t LEFT JOIN accounts ta ON ta.id = t.account_id
        WHERE t.user_id = $1 AND t.archived_date BETWEEN $2 AND $3
        ORDER BY cost DESC
      `, params);

      res.json(result.rows);
    } else {
      // Today: use live *_today tables
      const uf = userId ? 'WHERE user_id = $1' : '';
      const params = userId ? [userId] : [];

      const result = await pool.query(`
        SELECT
          'newsbreak' AS platform,
          n.ad_id, n.ad_name, n.campaign_name, n.adset_name,
          n.spend AS cost, n.impressions, n.cpm, n.clicks, n.cpc, n.ctr, n.conversions, n.cpa,
          COALESCE(n.cvr, 0) AS cvr,
          n.conversion_value AS total_conversion_value,
          CASE WHEN n.conversions > 0 THEN n.conversion_value / n.conversions ELSE 0 END AS value_per_conversion,
          n.synced_at,
          COALESCE(a.name, 'NewsBreak') AS account_name
        FROM newsbreak_ads_today n LEFT JOIN accounts a ON a.platform_account_id = n.account_id AND a.user_id = n.user_id AND a.status = 'active' ${uf.replace('WHERE', 'WHERE n.')}
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
          synced_at,
          account_name
        FROM fb_ads_today ${uf}
        UNION ALL
        SELECT
          'tiktok' AS platform,
          t.ad_id, t.ad_name, t.campaign_name, t.adgroup_name AS adset_name,
          t.spend AS cost, t.impressions, t.cpm, t.clicks, t.cpc, t.ctr,
          COALESCE(t.conversions, 0) AS conversions,
          CASE WHEN COALESCE(t.conversions, 0) > 0 THEN t.spend / t.conversions ELSE 0 END AS cpa,
          CASE WHEN t.clicks > 0 THEN COALESCE(t.conversions, 0)::NUMERIC / t.clicks ELSE 0 END AS cvr,
          COALESCE(t.conversion_value, 0) AS total_conversion_value,
          CASE WHEN COALESCE(t.conversions, 0) > 0 THEN COALESCE(t.conversion_value, 0) / t.conversions ELSE 0 END AS value_per_conversion,
          t.synced_at,
          COALESCE(ta.name, 'TikTok') AS account_name
        FROM tiktok_ads_today t LEFT JOIN accounts ta ON ta.id = t.account_id ${uf.replace('WHERE', 'WHERE t.')}
        ORDER BY cost DESC
      `, params);

      res.json(result.rows);
    }
  } catch (err) {
    console.error('Error fetching ad-level data:', err);
    res.status(500).json({ error: 'Failed to fetch ad data' });
  }
});

// GET /api/attribution/overlap — channel overlap
router.get('/overlap', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const range = parseDateRange(req.query as Record<string, any>);

    if (range && userId) {
      // Historical: query orders archive
      const params = [userId, range.startDate, range.endDate];

      const result = await pool.query(`
        SELECT
          COALESCE(NULLIF(order_data->>'utm_source', ''), 'direct') AS channel,
          COUNT(DISTINCT order_data->>'order_id') AS orders
        FROM orders_archive
        WHERE user_id = $1 AND archived_date BETWEEN $2 AND $3
          AND order_data->>'order_status' = 'completed'
          AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
        GROUP BY order_data->>'utm_source'
        ORDER BY orders DESC
      `, params);

      res.json(result.rows);
    } else {
      // Today: use live orders table
      const uf = userId ? 'AND user_id = $1' : '';
      const params = userId ? [userId] : [];

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
    }
  } catch (err) {
    console.error('Error fetching channel overlap:', err);
    res.status(500).json({ error: 'Failed to fetch overlap data' });
  }
});

export default router;
