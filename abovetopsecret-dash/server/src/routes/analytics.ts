import { Router, Request, Response } from 'express';
import pool from '../db';
import { parseAccountFilter } from '../services/account-filter';

const router = Router();

// Helper to get user_id filter
function userFilter(userId: number | null | undefined): { clause: string; params: any[] } {
  if (userId) return { clause: 'AND user_id = $1', params: [userId] };
  return { clause: '', params: [] };
}

// GET /api/analytics/timeseries?period=7d|30d|90d  OR  ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    // Determine date filtering mode
    const useDateRange = startDate && endDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate);

    // Check if the range includes today
    const todayStr = new Date().toISOString().split('T')[0];
    const includeToday = useDateRange ? endDate! >= todayStr : true;
    const isTodayOnly = useDateRange && startDate === todayStr && endDate === todayStr;

    // Build the archive date filter
    let dateFilterClause: string;
    const params: any[] = [];
    if (useDateRange) {
      params.push(startDate, endDate);
      dateFilterClause = `archived_date >= $1::DATE AND archived_date <= $2::DATE`;
    } else {
      const period = (req.query.period as string) || '7d';
      const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
      params.push(days);
      dateFilterClause = `archived_date >= CURRENT_DATE - ($1 || ' days')::INTERVAL`;
    }

    const uf = userId ? `AND user_id = $${params.length + 1}` : '';
    if (userId) params.push(userId);

    // Skip archive query if only looking at today
    let archiveRows: any[] = [];
    if (!isTodayOnly) {
      const result = await pool.query(`
        WITH meta_ad_data AS (
          SELECT
            archived_date AS date,
            COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend,
            COALESCE(SUM((ad_data->>'clicks')::NUMERIC), 0) AS clicks,
            COALESCE(SUM((ad_data->>'impressions')::NUMERIC), 0) AS impressions
          FROM fb_ads_archive
          WHERE ${dateFilterClause} ${uf}
          GROUP BY archived_date
        ),
        tiktok_ad_data AS (
          SELECT
            archived_date AS date,
            COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend,
            COALESCE(SUM((ad_data->>'clicks')::NUMERIC), 0) AS clicks,
            COALESCE(SUM((ad_data->>'impressions')::NUMERIC), 0) AS impressions
          FROM tiktok_ads_archive
          WHERE ${dateFilterClause} ${uf}
          GROUP BY archived_date
        ),
        newsbreak_ad_data AS (
          SELECT
            archived_date AS date,
            COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend,
            COALESCE(SUM((ad_data->>'clicks')::NUMERIC), 0) AS clicks,
            COALESCE(SUM((ad_data->>'impressions')::NUMERIC), 0) AS impressions
          FROM newsbreak_ads_archive
          WHERE ${dateFilterClause} ${uf}
          GROUP BY archived_date
        ),
        ad_data AS (
          SELECT
            COALESCE(m.date, t.date, n.date) AS date,
            COALESCE(m.spend, 0) + COALESCE(t.spend, 0) + COALESCE(n.spend, 0) AS spend,
            COALESCE(m.clicks, 0) + COALESCE(t.clicks, 0) + COALESCE(n.clicks, 0) AS clicks,
            COALESCE(m.impressions, 0) + COALESCE(t.impressions, 0) + COALESCE(n.impressions, 0) AS impressions
          FROM meta_ad_data m
          FULL OUTER JOIN tiktok_ad_data t ON m.date = t.date
          FULL OUTER JOIN newsbreak_ad_data n ON COALESCE(m.date, t.date) = n.date
        ),
        order_data AS (
          SELECT
            archived_date AS date,
            COALESCE(SUM(CASE WHEN order_data->>'order_status' = 'completed'
              AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
              THEN COALESCE((order_data->>'subtotal')::NUMERIC, (order_data->>'revenue')::NUMERIC) ELSE 0 END), 0) AS revenue,
            COUNT(DISTINCT CASE WHEN order_data->>'order_status' = 'completed'
              AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
              THEN order_data->>'order_id' END) AS conversions
          FROM orders_archive
          WHERE ${dateFilterClause} ${uf}
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

      archiveRows = result.rows;
    }

    const rows = archiveRows.map(r => ({
      date: r.date,
      spend: parseFloat(r.spend) || 0,
      revenue: parseFloat(r.revenue) || 0,
      clicks: parseInt(r.clicks) || 0,
      impressions: parseInt(r.impressions) || 0,
      conversions: parseInt(r.conversions) || 0,
      roas: parseFloat(r.roas) || 0,
    }));

    // Append today's live data if the range includes today
    if (includeToday) {
      const todayAdsQ = userId
        ? `SELECT
            COALESCE((SELECT SUM(spend) FROM fb_ads_today WHERE user_id = $1), 0) +
            COALESCE((SELECT SUM(spend) FROM tiktok_ads_today WHERE user_id = $1), 0) +
            COALESCE((SELECT SUM(spend) FROM newsbreak_ads_today WHERE user_id = $1), 0) AS spend,
            COALESCE((SELECT SUM(clicks) FROM fb_ads_today WHERE user_id = $1), 0) +
            COALESCE((SELECT SUM(clicks) FROM tiktok_ads_today WHERE user_id = $1), 0) +
            COALESCE((SELECT SUM(clicks) FROM newsbreak_ads_today WHERE user_id = $1), 0) AS clicks,
            COALESCE((SELECT SUM(impressions) FROM fb_ads_today WHERE user_id = $1), 0) +
            COALESCE((SELECT SUM(impressions) FROM tiktok_ads_today WHERE user_id = $1), 0) +
            COALESCE((SELECT SUM(impressions) FROM newsbreak_ads_today WHERE user_id = $1), 0) AS impressions`
        : `SELECT
            COALESCE((SELECT SUM(spend) FROM fb_ads_today), 0) +
            COALESCE((SELECT SUM(spend) FROM tiktok_ads_today), 0) +
            COALESCE((SELECT SUM(spend) FROM newsbreak_ads_today), 0) AS spend,
            COALESCE((SELECT SUM(clicks) FROM fb_ads_today), 0) +
            COALESCE((SELECT SUM(clicks) FROM tiktok_ads_today), 0) +
            COALESCE((SELECT SUM(clicks) FROM newsbreak_ads_today), 0) AS clicks,
            COALESCE((SELECT SUM(impressions) FROM fb_ads_today), 0) +
            COALESCE((SELECT SUM(impressions) FROM tiktok_ads_today), 0) +
            COALESCE((SELECT SUM(impressions) FROM newsbreak_ads_today), 0) AS impressions`;
      const todayOrdersQ = userId
        ? "SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue, COUNT(DISTINCT order_id) AS conversions FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) AND user_id = $1"
        : "SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS revenue, COUNT(DISTINCT order_id) AS conversions FROM cc_orders_today WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL)";
      const todayPlatformQ = userId
        ? "SELECT COALESCE(SUM(conversion_value), 0) AS platform_revenue, COALESCE(SUM(conversions), 0) AS platform_conversions FROM newsbreak_ads_today WHERE user_id = $1"
        : "SELECT COALESCE(SUM(conversion_value), 0) AS platform_revenue, COALESCE(SUM(conversions), 0) AS platform_conversions FROM newsbreak_ads_today";

      const [todayAds, todayOrders, todayPlatform] = await Promise.all([
        pool.query(todayAdsQ, userId ? [userId] : []),
        pool.query(todayOrdersQ, userId ? [userId] : []),
        pool.query(todayPlatformQ, userId ? [userId] : []),
      ]);

      const ta = todayAds.rows[0];
      const to = todayOrders.rows[0];
      const tp = todayPlatform.rows[0];
      const todaySpend = parseFloat(ta.spend) || 0;
      const ccRevenue = parseFloat(to.revenue) || 0;
      const ccConversions = parseInt(to.conversions) || 0;
      const platformRevenue = parseFloat(tp.platform_revenue) || 0;
      const platformConversions = parseInt(tp.platform_conversions) || 0;
      const todayRevenue = Math.max(ccRevenue, platformRevenue);
      const todayConversions = Math.max(ccConversions, platformConversions);

      rows.push({
        date: todayStr,
        spend: todaySpend,
        revenue: todayRevenue,
        clicks: parseInt(ta.clicks) || 0,
        impressions: parseInt(ta.impressions) || 0,
        conversions: todayConversions,
        roas: todaySpend > 0 ? todayRevenue / todaySpend : 0,
      });
    }

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
    const baf = await parseAccountFilter(req.query as Record<string, any>, params.length + 1, userId);
    const bAllParams = [...params, ...baf.params];
    // For WHERE-prefixed queries, convert af.clause (AND ...) to additional WHERE if no userId
    const ufWithAf = uf ? `${uf} ${baf.clause}` : (baf.clause ? `WHERE 1=1 ${baf.clause}` : '');
    const ufAndWithAf = `${ufAnd} ${baf.clause}`;

    let result;
    if (by === 'account') {
      result = await pool.query(`
        WITH all_ads AS (
          SELECT account_name AS label, spend, clicks, impressions FROM fb_ads_today ${ufWithAf}
          UNION ALL
          SELECT COALESCE(a.name, 'TikTok') AS label, t.spend, t.clicks, t.impressions FROM tiktok_ads_today t LEFT JOIN accounts a ON a.id = t.account_id ${ufWithAf.replace('WHERE', 'WHERE t.').replace('AND user_id', 'AND t.user_id')}
          UNION ALL
          SELECT COALESCE(a.name, 'NewsBreak') AS label, n.spend, n.clicks, n.impressions FROM newsbreak_ads_today n LEFT JOIN accounts a ON a.platform = 'newsbreak' AND a.user_id = n.user_id ${ufWithAf.replace('WHERE', 'WHERE n.').replace('AND user_id', 'AND n.user_id')}
        )
        SELECT
          label,
          SUM(spend) AS spend,
          SUM(clicks) AS clicks,
          SUM(impressions) AS impressions
        FROM all_ads
        GROUP BY label ORDER BY spend DESC
      `, bAllParams);
    } else if (by === 'campaign') {
      result = await pool.query(`
        WITH all_ads AS (
          SELECT campaign_name AS label, spend, clicks, impressions FROM fb_ads_today ${ufWithAf}
          UNION ALL
          SELECT campaign_name AS label, spend, clicks, impressions FROM tiktok_ads_today ${ufWithAf}
          UNION ALL
          SELECT campaign_name AS label, spend, clicks, impressions FROM newsbreak_ads_today ${ufWithAf}
        )
        SELECT
          label,
          SUM(spend) AS spend,
          SUM(clicks) AS clicks,
          SUM(impressions) AS impressions
        FROM all_ads
        GROUP BY label ORDER BY spend DESC LIMIT 20
      `, bAllParams);
    } else {
      // by offer
      result = await pool.query(`
        SELECT
          offer_name AS label,
          SUM(COALESCE(subtotal, revenue)) AS revenue,
          COUNT(DISTINCT order_id) AS conversions
        FROM cc_orders_today
        WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${ufAndWithAf}
        GROUP BY offer_name ORDER BY revenue DESC
      `, bAllParams);
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
    const faf = await parseAccountFilter(req.query as Record<string, any>, params.length + 1, userId);
    const fAllParams = [...params, ...faf.params];
    const ufFunnel = uf ? `${uf} ${faf.clause}` : (faf.clause ? `WHERE 1=1 ${faf.clause}` : '');

    const [adsResult, ordersResult, upsellsResult, platformConvResult] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(impressions) FROM fb_ads_today ${ufFunnel}), 0) +
          COALESCE((SELECT SUM(impressions) FROM tiktok_ads_today ${ufFunnel}), 0) +
          COALESCE((SELECT SUM(impressions) FROM newsbreak_ads_today ${ufFunnel}), 0) AS impressions,
          COALESCE((SELECT SUM(clicks) FROM fb_ads_today ${ufFunnel}), 0) +
          COALESCE((SELECT SUM(clicks) FROM tiktok_ads_today ${ufFunnel}), 0) +
          COALESCE((SELECT SUM(clicks) FROM newsbreak_ads_today ${ufFunnel}), 0) AS clicks,
          COALESCE((SELECT SUM(landing_page_views) FROM fb_ads_today ${ufFunnel}), 0) AS lp_views
      `, fAllParams),
      pool.query(`
        SELECT COUNT(DISTINCT order_id) AS orders
        FROM cc_orders_today
        WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${ufAnd} ${faf.clause}
      `, fAllParams),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE offered) AS upsells_offered,
          COUNT(*) FILTER (WHERE accepted) AS upsells_accepted
        FROM cc_upsells_today ${ufFunnel}
      `, fAllParams),
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(conversions) FROM newsbreak_ads_today ${ufFunnel}), 0) +
          COALESCE((SELECT SUM(conversions) FROM tiktok_ads_today ${ufFunnel}), 0) AS platform_conversions
      `, fAllParams),
    ]);

    const ads = adsResult.rows[0];
    const orders = ordersResult.rows[0];
    const upsells = upsellsResult.rows[0];
    const ccOrders = parseInt(orders.orders) || 0;
    const platformConv = parseInt(platformConvResult.rows[0].platform_conversions) || 0;

    res.json({
      impressions: parseInt(ads.impressions) || 0,
      clicks: parseInt(ads.clicks) || 0,
      lp_views: parseInt(ads.lp_views) || 0,
      orders: Math.max(ccOrders, platformConv),
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
    const smaf = await parseAccountFilter(req.query as Record<string, any>, params.length + 1, userId);
    const smAllParams = [...params, ...smaf.params];

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
        WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${ufAnd} ${smaf.clause}
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
          WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${ufAnd} ${smaf.clause}
          UNION ALL
          SELECT
            order_data->>'utm_source' AS utm_source,
            order_data->>'utm_medium' AS utm_medium,
            COALESCE((order_data->>'subtotal')::NUMERIC, (order_data->>'revenue')::NUMERIC) AS revenue,
            order_data->>'order_id' AS order_id
          FROM orders_archive
          WHERE archived_date >= CURRENT_DATE - INTERVAL '${days} days'
            AND order_data->>'order_status' = 'completed'
            AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
            ${ufArchive}
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

    const result = await pool.query(query, smAllParams);

    let rows = result.rows.map(r => ({
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      revenue: parseFloat(r.revenue) || 0,
      conversions: parseInt(r.conversions) || 0,
      orders: parseInt(r.orders) || 0,
    }));

    // If no CC order data, generate synthetic rows from ad platform data
    if (rows.length === 0) {
      const platformQ = `
        SELECT platform, SUM(spend) AS spend, SUM(conversions) AS conversions, SUM(conversion_value) AS revenue
        FROM (
          SELECT 'newsbreak' AS platform, spend, COALESCE(conversions, 0) AS conversions, COALESCE(conversion_value, 0) AS conversion_value FROM newsbreak_ads_today ${userId ? 'WHERE user_id = $1' : ''}
          UNION ALL
          SELECT 'tiktok' AS platform, spend, COALESCE(conversions, 0), COALESCE(conversion_value, 0) FROM tiktok_ads_today ${userId ? 'WHERE user_id = $1' : ''}
          UNION ALL
          SELECT 'facebook' AS platform, spend, 0, 0 FROM fb_ads_today ${userId ? 'WHERE user_id = $1' : ''}
        ) plat
        GROUP BY platform
        HAVING SUM(spend) > 0
        ORDER BY SUM(spend) DESC
      `;
      const platformResult = await pool.query(platformQ, userId ? [userId] : []);
      rows = platformResult.rows.map(r => ({
        utm_source: r.platform,
        utm_medium: 'paid',
        revenue: parseFloat(r.revenue) || 0,
        conversions: parseInt(r.conversions) || 0,
        orders: parseInt(r.conversions) || 0,
      }));
    }

    res.json(rows);
  } catch (err) {
    console.error('Error fetching source/medium:', err);
    res.status(500).json({ error: 'Failed to fetch source/medium data' });
  }
});

// GET /api/analytics/pnl — Profit & Loss summary
// Uses the full P&L formula:
//   Gross Revenue - Refunds = Net Revenue
//   Net Revenue - COGS - Shipping - Handling - Gateway Fees = Gross Profit
//   Gross Profit - Ad Spend = Net Profit (after ads)
//   Net Profit - Fixed Costs = True Net Profit
router.get('/pnl', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const uf = userId ? 'WHERE user_id = $1' : '';
    const ufAnd = userId ? 'AND user_id = $1' : '';
    const params = userId ? [userId] : [];
    const paf = await parseAccountFilter(req.query as Record<string, any>, params.length + 1, userId);
    const pAllParams = [...params, ...paf.params];
    const ufPnl = uf ? `${uf} ${paf.clause}` : (paf.clause ? `WHERE 1=1 ${paf.clause}` : '');

    const [adSpendResult, revenueResult, refundResult, orderCountResult, costsResult, platformRevenueResult] = await Promise.all([
      // Total ad spend (Meta + TikTok + NewsBreak)
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(spend) FROM fb_ads_today ${ufPnl}), 0) +
          COALESCE((SELECT SUM(spend) FROM tiktok_ads_today ${ufPnl}), 0) +
          COALESCE((SELECT SUM(spend) FROM newsbreak_ads_today ${ufPnl}), 0) AS total_spend
      `, pAllParams),
      // Gross revenue (completed, non-test orders)
      pool.query(`
        SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS gross_revenue
        FROM cc_orders_today
        WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${ufAnd} ${paf.clause}
      `, pAllParams),
      // Refund revenue
      pool.query(`
        SELECT COALESCE(SUM(COALESCE(subtotal, revenue)), 0) AS refund_total
        FROM cc_orders_today
        WHERE order_status = 'refunded' AND (is_test = false OR is_test IS NULL) ${ufAnd} ${paf.clause}
      `, pAllParams),
      // Order count (for per-order costs)
      pool.query(`
        SELECT COUNT(DISTINCT order_id) AS order_count
        FROM cc_orders_today
        WHERE order_status = 'completed' AND (is_test = false OR is_test IS NULL) ${ufAnd} ${paf.clause}
      `, pAllParams),
      // Cost settings by type
      pool.query(`
        SELECT cost_type, cost_unit,
          COALESCE(SUM(cost_value), 0) AS total_value
        FROM cost_settings
        ${ufPnl}
        GROUP BY cost_type, cost_unit
      `, pAllParams),
      // Platform-reported revenue/conversions (fallback for users without CC orders)
      pool.query(`
        SELECT
          COALESCE((SELECT SUM(conversion_value) FROM newsbreak_ads_today ${ufPnl}), 0) +
          COALESCE((SELECT SUM(conversion_value) FROM tiktok_ads_today ${ufPnl}), 0) AS platform_revenue,
          COALESCE((SELECT SUM(conversions) FROM newsbreak_ads_today ${ufPnl}), 0) +
          COALESCE((SELECT SUM(conversions) FROM tiktok_ads_today ${ufPnl}), 0) AS platform_conversions
      `, pAllParams),
    ]);

    const adSpend = parseFloat(adSpendResult.rows[0].total_spend) || 0;
    const ccGrossRevenue = parseFloat(revenueResult.rows[0].gross_revenue) || 0;
    const platformRevenue = parseFloat(platformRevenueResult.rows[0].platform_revenue) || 0;
    const grossRevenue = Math.max(ccGrossRevenue, platformRevenue);
    const refunds = parseFloat(refundResult.rows[0].refund_total) || 0;
    const netRevenue = grossRevenue - refunds;
    const ccOrderCount = parseInt(orderCountResult.rows[0].order_count) || 0;
    const platformConversions = parseInt(platformRevenueResult.rows[0].platform_conversions) || 0;
    const orderCount = Math.max(ccOrderCount, platformConversions);

    // Parse cost settings by type
    let cogs = 0;
    let shipping = 0;
    let handling = 0;
    let gatewayFeePct = 0;
    let gatewayFeeFlat = 0;
    let fixedMonthly = 0;

    for (const row of costsResult.rows) {
      const val = parseFloat(row.total_value) || 0;
      switch (row.cost_type) {
        case 'cogs':
          // COGS: if unit is 'fixed', it's per-unit cost; if 'percentage', it's % of revenue
          cogs += row.cost_unit === 'percentage' ? (netRevenue * val / 100) : (val * orderCount);
          break;
        case 'shipping':
          shipping += row.cost_unit === 'percentage' ? (netRevenue * val / 100) : (val * orderCount);
          break;
        case 'handling':
          handling += row.cost_unit === 'percentage' ? (netRevenue * val / 100) : (val * orderCount);
          break;
        case 'gateway_fee_pct':
          gatewayFeePct += val;
          break;
        case 'gateway_fee_flat':
          gatewayFeeFlat += val;
          break;
        case 'fixed_monthly':
          fixedMonthly += val;
          break;
      }
    }

    const gatewayFees = (netRevenue * gatewayFeePct / 100) + (orderCount * gatewayFeeFlat);
    const totalCosts = cogs + shipping + handling + gatewayFees;
    const grossProfit = netRevenue - totalCosts;
    const netProfit = grossProfit - adSpend;
    // Prorate fixed monthly costs to today (1/30 of monthly)
    const dailyFixedCosts = fixedMonthly / 30;
    const trueNetProfit = netProfit - dailyFixedCosts;
    const margin = netRevenue > 0 ? (trueNetProfit / netRevenue) * 100 : 0;

    res.json({
      grossRevenue,
      refunds,
      netRevenue,
      cogs,
      shipping,
      handling,
      gatewayFees,
      totalCosts,
      grossProfit,
      adSpend,
      netProfit,
      fixedCosts: parseFloat(dailyFixedCosts.toFixed(2)),
      trueNetProfit: parseFloat(trueNetProfit.toFixed(2)),
      margin: parseFloat(margin.toFixed(2)),
      orderCount,
    });
  } catch (err) {
    console.error('Error fetching P&L:', err);
    res.status(500).json({ error: 'Failed to fetch P&L data' });
  }
});

export default router;
