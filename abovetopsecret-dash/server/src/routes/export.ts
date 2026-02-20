import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// Sanitize CSV values to prevent formula injection in Excel
function csvSafe(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

// GET /api/export/csv
router.get('/csv', async (req: Request, res: Response) => {
  try {
    const { offer, account } = req.query;
    const userId = (req as any).user?.id as number | undefined;
    const userFilter = userId ? 'AND user_id = $1' : 'AND user_id IS NULL';
    const userParams = userId ? [userId] : [];

    const coreResult = await pool.query(`
      WITH fb_agg AS (
        SELECT
          ad_set_name,
          account_name,
          SUM(spend) AS spend,
          SUM(clicks) AS clicks,
          SUM(impressions) AS impressions,
          SUM(landing_page_views) AS landing_page_views
        FROM fb_ads_today
        WHERE 1=1 ${userFilter}
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
        WHERE order_status = 'completed' ${userFilter}
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
    `, userParams);

    let rows = coreResult.rows;

    // Extended: take rates
    const takeRatesResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN quantity = 1 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS take_rate_1,
        ROUND((SUM(CASE WHEN quantity = 3 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS take_rate_3,
        ROUND((SUM(CASE WHEN quantity = 5 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS take_rate_5
      FROM cc_orders_today WHERE is_core_sku = true ${userFilter} GROUP BY offer_name
    `, userParams);
    const takeRatesMap = new Map(takeRatesResult.rows.map((r: any) => [r.offer_name, r]));

    // Extended: subscription pct
    const subPctResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN subscription_id IS NOT NULL THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS subscription_pct
      FROM cc_orders_today WHERE 1=1 ${userFilter} GROUP BY offer_name
    `, userParams);
    const subPctMap = new Map(subPctResult.rows.map((r: any) => [r.offer_name, r]));

    // Extended: sub take rates
    const subTakeResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN quantity = 1 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_1,
        ROUND((SUM(CASE WHEN quantity = 3 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_3,
        ROUND((SUM(CASE WHEN quantity = 5 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_5
      FROM cc_orders_today WHERE subscription_id IS NOT NULL ${userFilter} GROUP BY offer_name
    `, userParams);
    const subTakeMap = new Map(subTakeResult.rows.map((r: any) => [r.offer_name, r]));

    // Extended: upsell rates
    const upsellResult = await pool.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN accepted THEN 1 ELSE 0 END)::NUMERIC / NULLIF(SUM(CASE WHEN offered THEN 1 ELSE 0 END), 0) * 100), 1) AS upsell_take_rate,
        ROUND(((1 - (SUM(CASE WHEN accepted THEN 1 ELSE 0 END)::NUMERIC / NULLIF(SUM(CASE WHEN offered THEN 1 ELSE 0 END), 0))) * 100), 1) AS upsell_decline_rate
      FROM cc_upsells_today WHERE 1=1 ${userFilter} GROUP BY offer_name
    `, userParams);
    const upsellMap = new Map(upsellResult.rows.map((r: any) => [r.offer_name, r]));

    // Join extended metrics to core rows
    rows = rows.map((r: any) => {
      const tr = takeRatesMap.get(r.offer_name);
      const sp = subPctMap.get(r.offer_name);
      const st = subTakeMap.get(r.offer_name);
      const up = upsellMap.get(r.offer_name);
      return {
        ...r,
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

    if (offer && offer !== 'All') {
      rows = rows.filter((r: any) => r.offer_name === offer);
    }
    if (account && account !== 'All') {
      rows = rows.filter((r: any) => r.account_name === account);
    }

    const headers = [
      'Offer', 'Account', 'Spend', 'Revenue', 'ROI', 'CPA', 'AOV', 'CTR', 'CPM', 'CPC', 'CVR',
      'Conversions', 'New %', 'LP CTR', '1-Pack %', '3-Pack %', '5-Pack %', 'Sub %',
      'Sub 1-Pack %', 'Sub 3-Pack %', 'Sub 5-Pack %', 'Upsell Take %', 'Upsell Decline %',
    ];
    const csvRows = rows.map((r: any) => [
      `"${csvSafe(r.offer_name)}"`,
      `"${csvSafe(r.account_name)}"`,
      parseFloat(r.spend).toFixed(2),
      parseFloat(r.revenue).toFixed(2),
      parseFloat(r.roi).toFixed(4),
      parseFloat(r.cpa).toFixed(2),
      parseFloat(r.aov).toFixed(2),
      parseFloat(r.ctr).toFixed(4),
      parseFloat(r.cpm).toFixed(2),
      parseFloat(r.cpc).toFixed(2),
      parseFloat(r.cvr).toFixed(4),
      r.conversions,
      parseFloat(r.new_customer_pct).toFixed(4),
      parseFloat(r.lp_ctr).toFixed(4),
      r.take_rate_1.toFixed(1),
      r.take_rate_3.toFixed(1),
      r.take_rate_5.toFixed(1),
      r.subscription_pct.toFixed(1),
      r.sub_take_rate_1.toFixed(1),
      r.sub_take_rate_3.toFixed(1),
      r.sub_take_rate_5.toFixed(1),
      r.upsell_take_rate.toFixed(1),
      r.upsell_decline_rate.toFixed(1),
    ].join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    const date = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ats-metrics-${date}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Error exporting CSV:', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

export default router;
