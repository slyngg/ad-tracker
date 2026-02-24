import { Router, Request, Response } from 'express';
import pool from '../db';
import { parseAccountFilter } from '../services/account-filter';
import { getUserTimezone } from '../services/timezone';

const router = Router();

interface MetricRow {
  account_name: string;
  offer_name: string;
  spend: number;
  revenue: number;
  roi: number;
  cpa: number;
  aov: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cvr: number;
  conversions: number;
  new_customer_pct: number;
  lp_ctr: number;
  take_rate_1?: number;
  take_rate_3?: number;
  take_rate_5?: number;
  subscription_pct?: number;
  sub_take_rate_1?: number;
  sub_take_rate_3?: number;
  sub_take_rate_5?: number;
  upsell_take_rate?: number;
  upsell_decline_rate?: number;
  _overrides?: Record<string, OverrideInfo>;
}

interface Override {
  metric_key: string;
  offer_name: string;
  override_value: number;
  set_by: string;
  set_at: string;
}

interface OverrideInfo {
  original: number;
  override: number;
  set_by: string;
  set_at: string;
}

// GET /api/metrics?offer=X&account=Y
router.get('/', async (req: Request, res: Response) => {
  try {
    const { offer, account } = req.query;
    const userId = (req as any).user?.id as number | undefined;
    const userFilter = userId ? 'AND user_id = $1' : 'AND user_id IS NULL';
    const userParams = userId ? [userId] : [];
    const af = parseAccountFilter(req.query as Record<string, any>, userParams.length + 1);
    const allParams = [...userParams, ...af.params];

    // Core metrics — pre-aggregate both sides to eliminate many-to-many fan-out.
    // all_ads_agg: one row per (adset_key, account_name) across all platforms.
    // cc_agg: one row per (utm_campaign, offer_name) — collapses multiple orders per campaign.
    // nb_rev: NewsBreak conversion_value as fallback revenue (for users without CC orders).
    let coreQuery = `
      WITH all_ads_agg AS (
        SELECT
          ad_set_name AS adset_key,
          account_name,
          SUM(spend) AS spend,
          SUM(clicks) AS clicks,
          SUM(impressions) AS impressions,
          SUM(landing_page_views) AS landing_page_views,
          0::NUMERIC AS platform_conversion_value,
          0 AS platform_conversions
        FROM fb_ads_today
        WHERE 1=1 ${userFilter} ${af.clause}
        GROUP BY ad_set_name, account_name
        UNION ALL
        SELECT
          adgroup_name AS adset_key,
          COALESCE(a.name, 'TikTok') AS account_name,
          SUM(t.spend) AS spend,
          SUM(t.clicks) AS clicks,
          SUM(t.impressions) AS impressions,
          0 AS landing_page_views,
          COALESCE(SUM(t.conversion_value), 0) AS platform_conversion_value,
          COALESCE(SUM(t.conversions), 0) AS platform_conversions
        FROM tiktok_ads_today t
        LEFT JOIN accounts a ON a.id = t.account_id
        WHERE 1=1 ${userFilter.replace('user_id', 't.user_id')} ${af.clause}
        GROUP BY adgroup_name, a.name
        UNION ALL
        SELECT
          adset_name AS adset_key,
          COALESCE(a.name, 'NewsBreak') AS account_name,
          SUM(n.spend) AS spend,
          SUM(n.clicks) AS clicks,
          SUM(n.impressions) AS impressions,
          0 AS landing_page_views,
          COALESCE(SUM(n.conversion_value), 0) AS platform_conversion_value,
          COALESCE(SUM(n.conversions), 0) AS platform_conversions
        FROM newsbreak_ads_today n
        LEFT JOIN accounts a ON a.platform = 'newsbreak' AND a.user_id = n.user_id
        WHERE 1=1 ${userFilter.replace('user_id', 'n.user_id')} ${af.clause}
        GROUP BY adset_name, a.name
      ),
      cc_agg AS (
        SELECT
          normalize_attribution_key(utm_campaign) AS utm_campaign,
          offer_name,
          SUM(COALESCE(subtotal, revenue)) AS revenue,
          COUNT(DISTINCT order_id) AS conversions,
          COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS new_customers
        FROM cc_orders_today
        WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${userFilter} ${af.clause}
        GROUP BY normalize_attribution_key(utm_campaign), offer_name
      )
      SELECT
        ads.account_name,
        COALESCE(cc.offer_name, 'Unattributed') AS offer_name,
        SUM(ads.spend) AS spend,
        GREATEST(COALESCE(SUM(cc.revenue), 0), SUM(ads.platform_conversion_value)) AS revenue,
        CASE WHEN SUM(ads.spend) > 0 THEN GREATEST(COALESCE(SUM(cc.revenue), 0), SUM(ads.platform_conversion_value)) / SUM(ads.spend) ELSE 0 END AS roi,
        CASE WHEN GREATEST(COALESCE(SUM(cc.conversions), 0), SUM(ads.platform_conversions)) > 0 THEN SUM(ads.spend) / GREATEST(COALESCE(SUM(cc.conversions), 0), SUM(ads.platform_conversions)) ELSE 0 END AS cpa,
        CASE WHEN GREATEST(COALESCE(SUM(cc.conversions), 0), SUM(ads.platform_conversions)) > 0 THEN GREATEST(COALESCE(SUM(cc.revenue), 0), SUM(ads.platform_conversion_value)) / GREATEST(COALESCE(SUM(cc.conversions), 0), SUM(ads.platform_conversions)) ELSE 0 END AS aov,
        CASE WHEN SUM(ads.impressions) > 0 THEN SUM(ads.clicks)::FLOAT / SUM(ads.impressions) ELSE 0 END AS ctr,
        CASE WHEN SUM(ads.impressions) > 0 THEN (SUM(ads.spend) / SUM(ads.impressions)) * 1000 ELSE 0 END AS cpm,
        CASE WHEN SUM(ads.clicks) > 0 THEN SUM(ads.spend) / SUM(ads.clicks) ELSE 0 END AS cpc,
        CASE WHEN SUM(ads.clicks) > 0 THEN GREATEST(COALESCE(SUM(cc.conversions), 0), SUM(ads.platform_conversions))::FLOAT / SUM(ads.clicks) ELSE 0 END AS cvr,
        GREATEST(COALESCE(SUM(cc.conversions), 0), SUM(ads.platform_conversions)) AS conversions,
        CASE WHEN COALESCE(SUM(cc.conversions), 0) > 0
          THEN SUM(cc.new_customers)::FLOAT / SUM(cc.conversions)
          ELSE 0 END AS new_customer_pct,
        CASE WHEN SUM(ads.impressions) > 0 THEN SUM(ads.landing_page_views)::FLOAT / SUM(ads.impressions) ELSE 0 END AS lp_ctr
      FROM all_ads_agg ads
      LEFT JOIN cc_agg cc ON normalize_attribution_key(ads.adset_key) = cc.utm_campaign
      GROUP BY ads.account_name, cc.offer_name
      ORDER BY spend DESC
    `;

    console.log('[Metrics] userId:', userId, 'allParams:', allParams, 'af.clause:', af.clause);
    const coreResult = await pool.query(coreQuery, allParams);
    console.log('[Metrics] coreResult.rows.length:', coreResult.rows.length, 'sample:', coreResult.rows[0]);
    let rows: MetricRow[] = coreResult.rows.map((r) => ({
      ...r,
      spend: parseFloat(r.spend) || 0,
      revenue: parseFloat(r.revenue) || 0,
      roi: parseFloat(r.roi) || 0,
      cpa: parseFloat(r.cpa) || 0,
      aov: parseFloat(r.aov) || 0,
      ctr: parseFloat(r.ctr) || 0,
      cpm: parseFloat(r.cpm) || 0,
      cpc: parseFloat(r.cpc) || 0,
      cvr: parseFloat(r.cvr) || 0,
      conversions: parseInt(r.conversions) || 0,
      new_customer_pct: parseFloat(r.new_customer_pct) || 0,
      lp_ctr: parseFloat(r.lp_ctr) || 0,
    }));

    // Extended: take rates
    const takeRatesResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN quantity = 1 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS take_rate_1,
        ROUND((SUM(CASE WHEN quantity = 3 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS take_rate_3,
        ROUND((SUM(CASE WHEN quantity = 5 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS take_rate_5
      FROM cc_orders_today WHERE is_core_sku = true AND (is_test = false OR is_test IS NULL) ${userFilter} ${af.clause} GROUP BY offer_name
    `, allParams);
    const takeRatesMap = new Map(takeRatesResult.rows.map((r) => [r.offer_name, r]));

    // Extended: subscription pct
    const subPctResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN subscription_id IS NOT NULL THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS subscription_pct
      FROM cc_orders_today WHERE (is_test = false OR is_test IS NULL) ${userFilter} ${af.clause} GROUP BY offer_name
    `, allParams);
    const subPctMap = new Map(subPctResult.rows.map((r) => [r.offer_name, r]));

    // Extended: sub take rates
    const subTakeResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN quantity = 1 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_1,
        ROUND((SUM(CASE WHEN quantity = 3 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_3,
        ROUND((SUM(CASE WHEN quantity = 5 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_5
      FROM cc_orders_today WHERE subscription_id IS NOT NULL AND (is_test = false OR is_test IS NULL) ${userFilter} ${af.clause} GROUP BY offer_name
    `, allParams);
    const subTakeMap = new Map(subTakeResult.rows.map((r) => [r.offer_name, r]));

    // Extended: upsell rates
    const upsellResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN accepted THEN 1 ELSE 0 END)::NUMERIC / NULLIF(SUM(CASE WHEN offered THEN 1 ELSE 0 END), 0) * 100), 1) AS upsell_take_rate,
        ROUND(((1 - (SUM(CASE WHEN accepted THEN 1 ELSE 0 END)::NUMERIC / NULLIF(SUM(CASE WHEN offered THEN 1 ELSE 0 END), 0))) * 100), 1) AS upsell_decline_rate
      FROM cc_upsells_today WHERE 1=1 ${userFilter} ${af.clause} GROUP BY offer_name
    `, allParams);
    const upsellMap = new Map(upsellResult.rows.map((r) => [r.offer_name, r]));

    // Join extended metrics
    rows = rows.map((row) => {
      const tr = takeRatesMap.get(row.offer_name);
      const sp = subPctMap.get(row.offer_name);
      const st = subTakeMap.get(row.offer_name);
      const up = upsellMap.get(row.offer_name);
      return {
        ...row,
        take_rate_1: parseFloat(tr?.take_rate_1) || 0,
        take_rate_3: parseFloat(tr?.take_rate_3) || 0,
        take_rate_5: parseFloat(tr?.take_rate_5) || 0,
        subscription_pct: parseFloat(sp?.subscription_pct) || 0,
        sub_take_rate_1: parseFloat(st?.sub_take_rate_1) || 0,
        sub_take_rate_3: parseFloat(st?.sub_take_rate_3) || 0,
        sub_take_rate_5: parseFloat(st?.sub_take_rate_5) || 0,
        upsell_take_rate: parseFloat(up?.upsell_take_rate) || 0,
        upsell_decline_rate: parseFloat(up?.upsell_decline_rate) || 0,
      };
    });

    // Apply manual overrides
    const overridesResult = await pool.query(
      userId
        ? 'SELECT metric_key, offer_name, override_value, set_by, set_at FROM manual_overrides WHERE user_id = $1'
        : 'SELECT metric_key, offer_name, override_value, set_by, set_at FROM manual_overrides WHERE user_id IS NULL',
      userParams
    );
    const overrides: Override[] = overridesResult.rows;

    rows = rows.map((row) => {
      const _overrides: Record<string, OverrideInfo> = {};
      for (const ov of overrides) {
        if (ov.offer_name === 'ALL' || ov.offer_name === row.offer_name) {
          const key = ov.metric_key as keyof MetricRow;
          if (key in row && typeof row[key] === 'number') {
            const originalValue = row[key] as number;
            (row as unknown as Record<string, unknown>)[key] = parseFloat(String(ov.override_value));
            _overrides[ov.metric_key] = {
              original: originalValue,
              override: parseFloat(String(ov.override_value)),
              set_by: ov.set_by,
              set_at: ov.set_at,
            };
          }
        }
      }
      return { ...row, _overrides };
    });

    // Apply filters
    if (offer && offer !== 'All') {
      rows = rows.filter((r) => r.offer_name === offer);
    }
    if (account && account !== 'All') {
      rows = rows.filter((r) => r.account_name === account);
    }

    res.json(rows);
  } catch (err) {
    console.error('Error fetching metrics:', err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// GET /api/metrics/summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id as number | undefined;
    const userFilter = userId ? 'AND user_id = $1' : 'AND user_id IS NULL';
    const userParams = userId ? [userId] : [];
    const prevUserFilter = userId ? 'AND user_id = $1' : '';
    const saf = parseAccountFilter(req.query as Record<string, any>, userParams.length + 1);
    const sAllParams = [...userParams, ...saf.params];

    // Compute totals from each table independently — no join needed for summary
    // Include both Meta and TikTok ad spend
    const result = await pool.query(`
      SELECT
        (SELECT COALESCE(SUM(spend), 0) FROM fb_ads_today WHERE 1=1 ${userFilter} ${saf.clause}) +
        (SELECT COALESCE(SUM(spend), 0) FROM tiktok_ads_today WHERE 1=1 ${userFilter} ${saf.clause}) +
        (SELECT COALESCE(SUM(spend), 0) FROM newsbreak_ads_today WHERE 1=1 ${userFilter} ${saf.clause}) AS total_spend,
        (SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${userFilter} ${saf.clause})
        + (SELECT COALESCE(SUM(conversion_value), 0) FROM newsbreak_ads_today WHERE 1=1 ${userFilter} ${saf.clause}) AS total_revenue,
        GREATEST(
          (SELECT COUNT(DISTINCT order_id) FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${userFilter} ${saf.clause}),
          (SELECT COALESCE(SUM(conversions), 0) FROM newsbreak_ads_today WHERE 1=1 ${userFilter} ${saf.clause})
        ) AS total_conversions
    `, sAllParams);

    // Fetch previous period (yesterday) from archive tables.
    // Time-of-day adjustment: only compare yesterday's data through the same hour
    // so a partial "today" isn't compared against a full "yesterday".
    // - Orders: filter by conversion_time <= current time-of-day (in user's timezone)
    // - Spend: prorate by fraction of day elapsed (FB reports daily totals, no hourly breakdown)
    // Use the user's timezone so "yesterday" and "current time" are correct for their locale.
    const tz = await getUserTimezone(userId);
    const prevTzParams = [...userParams, tz];
    const tzIdx = prevTzParams.length; // $1 if no userId, $2 if userId

    const prevSpendResult = await pool.query(`
      SELECT (
        COALESCE((SELECT SUM((ad_data->>'spend')::NUMERIC) FROM fb_ads_archive
          WHERE archived_date = (NOW() AT TIME ZONE $${tzIdx})::DATE - 1 ${prevUserFilter}), 0) +
        COALESCE((SELECT SUM((ad_data->>'spend')::NUMERIC) FROM tiktok_ads_archive
          WHERE archived_date = (NOW() AT TIME ZONE $${tzIdx})::DATE - 1 ${prevUserFilter}), 0) +
        COALESCE((SELECT SUM((ad_data->>'spend')::NUMERIC) FROM newsbreak_ads_archive
          WHERE archived_date = (NOW() AT TIME ZONE $${tzIdx})::DATE - 1 ${prevUserFilter}), 0)
      ) * (EXTRACT(EPOCH FROM (NOW() AT TIME ZONE $${tzIdx})::TIME) / 86400.0) AS prev_spend
    `, prevTzParams);

    const prevOrdersResult = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN order_data->>'order_status' = 'completed'
          AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
          THEN COALESCE((order_data->>'subtotal')::NUMERIC, (order_data->>'revenue')::NUMERIC) ELSE 0 END), 0) AS prev_revenue,
        COUNT(DISTINCT CASE WHEN order_data->>'order_status' = 'completed'
          AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
          THEN order_data->>'order_id' END) AS prev_conversions
      FROM orders_archive
      WHERE archived_date = (NOW() AT TIME ZONE $${tzIdx})::DATE - 1
        AND ((order_data->>'conversion_time')::TIMESTAMPTZ AT TIME ZONE $${tzIdx})::TIME <= (NOW() AT TIME ZONE $${tzIdx})::TIME
        ${prevUserFilter}
    `, prevTzParams);

    const row = result.rows[0];
    const totalSpend = parseFloat(row.total_spend) || 0;
    const totalRevenue = parseFloat(row.total_revenue) || 0;

    const prevSpend = parseFloat(prevSpendResult.rows[0]?.prev_spend) || 0;
    const prevRevenue = parseFloat(prevOrdersResult.rows[0]?.prev_revenue) || 0;
    const prevConversions = parseInt(prevOrdersResult.rows[0]?.prev_conversions) || 0;
    const prevRoi = prevSpend > 0 ? prevRevenue / prevSpend : 0;

    // Only include previous data if there's actually archived data for yesterday
    const hasPrevData = prevSpend > 0 || prevRevenue > 0 || prevConversions > 0;

    res.json({
      total_spend: totalSpend,
      total_revenue: totalRevenue,
      total_roi: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      total_conversions: parseInt(row.total_conversions) || 0,
      previous: hasPrevData ? {
        total_spend: prevSpend,
        total_revenue: prevRevenue,
        total_roi: prevRoi,
        total_conversions: prevConversions,
      } : null,
    });
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

export default router;
