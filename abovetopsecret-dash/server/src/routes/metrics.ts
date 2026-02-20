import { Router, Request, Response } from 'express';
import pool from '../db';

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

    // Core metrics — pre-aggregate both sides to eliminate many-to-many fan-out.
    // fb_agg: one row per (ad_set_name, account_name) — collapses multiple ads per ad set.
    // cc_agg: one row per (utm_campaign, offer_name) — collapses multiple orders per campaign.
    // The join is then 1:1 (or 1:few if one ad_set drives multiple offers).
    let coreQuery = `
      WITH fb_agg AS (
        SELECT
          ad_set_name,
          account_name,
          SUM(spend) AS spend,
          SUM(clicks) AS clicks,
          SUM(impressions) AS impressions,
          SUM(landing_page_views) AS landing_page_views
        FROM fb_ads_today
        GROUP BY ad_set_name, account_name
      ),
      cc_agg AS (
        SELECT
          utm_campaign,
          offer_name,
          SUM(COALESCE(subtotal, revenue)) AS revenue,
          COUNT(DISTINCT order_id) AS conversions,
          COUNT(DISTINCT CASE WHEN new_customer THEN order_id END) AS new_customers
        FROM cc_orders_today
        WHERE order_status = 'completed'
        GROUP BY utm_campaign, offer_name
      )
      SELECT
        fb.account_name,
        COALESCE(cc.offer_name, 'Unattributed') AS offer_name,
        SUM(fb.spend) AS spend,
        COALESCE(SUM(cc.revenue), 0) AS revenue,
        CASE WHEN SUM(fb.spend) > 0 THEN COALESCE(SUM(cc.revenue), 0) / SUM(fb.spend) ELSE 0 END AS roi,
        CASE WHEN COALESCE(SUM(cc.conversions), 0) > 0 THEN SUM(fb.spend) / SUM(cc.conversions) ELSE 0 END AS cpa,
        CASE WHEN COALESCE(SUM(cc.conversions), 0) > 0 THEN SUM(cc.revenue) / SUM(cc.conversions) ELSE 0 END AS aov,
        CASE WHEN SUM(fb.impressions) > 0 THEN SUM(fb.clicks)::FLOAT / SUM(fb.impressions) ELSE 0 END AS ctr,
        CASE WHEN SUM(fb.impressions) > 0 THEN (SUM(fb.spend) / SUM(fb.impressions)) * 1000 ELSE 0 END AS cpm,
        CASE WHEN SUM(fb.clicks) > 0 THEN SUM(fb.spend) / SUM(fb.clicks) ELSE 0 END AS cpc,
        CASE WHEN SUM(fb.clicks) > 0 THEN COALESCE(SUM(cc.conversions), 0)::FLOAT / SUM(fb.clicks) ELSE 0 END AS cvr,
        COALESCE(SUM(cc.conversions), 0) AS conversions,
        CASE WHEN COALESCE(SUM(cc.conversions), 0) > 0
          THEN SUM(cc.new_customers)::FLOAT / SUM(cc.conversions)
          ELSE 0 END AS new_customer_pct,
        CASE WHEN SUM(fb.impressions) > 0 THEN SUM(fb.landing_page_views)::FLOAT / SUM(fb.impressions) ELSE 0 END AS lp_ctr
      FROM fb_agg fb
      LEFT JOIN cc_agg cc ON fb.ad_set_name = cc.utm_campaign
      GROUP BY fb.account_name, cc.offer_name
      ORDER BY spend DESC
    `;

    const coreResult = await pool.query(coreQuery);
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
      FROM cc_orders_today WHERE is_core_sku = true GROUP BY offer_name
    `);
    const takeRatesMap = new Map(takeRatesResult.rows.map((r) => [r.offer_name, r]));

    // Extended: subscription pct
    const subPctResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN subscription_id IS NOT NULL THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS subscription_pct
      FROM cc_orders_today GROUP BY offer_name
    `);
    const subPctMap = new Map(subPctResult.rows.map((r) => [r.offer_name, r]));

    // Extended: sub take rates
    const subTakeResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN quantity = 1 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_1,
        ROUND((SUM(CASE WHEN quantity = 3 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_3,
        ROUND((SUM(CASE WHEN quantity = 5 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_5
      FROM cc_orders_today WHERE subscription_id IS NOT NULL GROUP BY offer_name
    `);
    const subTakeMap = new Map(subTakeResult.rows.map((r) => [r.offer_name, r]));

    // Extended: upsell rates
    const upsellResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN accepted THEN 1 ELSE 0 END)::NUMERIC / NULLIF(SUM(CASE WHEN offered THEN 1 ELSE 0 END), 0) * 100), 1) AS upsell_take_rate,
        ROUND(((1 - (SUM(CASE WHEN accepted THEN 1 ELSE 0 END)::NUMERIC / NULLIF(SUM(CASE WHEN offered THEN 1 ELSE 0 END), 0))) * 100), 1) AS upsell_decline_rate
      FROM cc_upsells_today GROUP BY offer_name
    `);
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
    const overridesResult = await pool.query('SELECT metric_key, offer_name, override_value, set_by, set_at FROM manual_overrides');
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
router.get('/summary', async (_req: Request, res: Response) => {
  try {
    // Compute totals from each table independently — no join needed for summary
    const result = await pool.query(`
      SELECT
        (SELECT COALESCE(SUM(spend), 0) FROM fb_ads_today) AS total_spend,
        (SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) FROM cc_orders_today WHERE order_status = 'completed') AS total_revenue,
        (SELECT COUNT(DISTINCT order_id) FROM cc_orders_today WHERE order_status = 'completed') AS total_conversions
    `);

    const row = result.rows[0];
    const totalSpend = parseFloat(row.total_spend) || 0;
    const totalRevenue = parseFloat(row.total_revenue) || 0;
    res.json({
      total_spend: totalSpend,
      total_revenue: totalRevenue,
      total_roi: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      total_conversions: parseInt(row.total_conversions) || 0,
    });
  } catch (err) {
    console.error('Error fetching summary:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

export default router;
