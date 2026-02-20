"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// GET /api/metrics?offer=X&account=Y
router.get('/', async (req, res) => {
    try {
        const { offer, account } = req.query;
        // Core metrics — use subtotal (excludes tax) and only count completed orders
        let coreQuery = `
      SELECT
        fb.account_name,
        COALESCE(cc.offer_name, 'Unattributed') AS offer_name,
        SUM(fb.spend) AS spend,
        SUM(COALESCE(cc.subtotal, cc.revenue)) AS revenue,
        CASE WHEN SUM(fb.spend) > 0 THEN SUM(COALESCE(cc.subtotal, cc.revenue)) / SUM(fb.spend) ELSE 0 END AS roi,
        CASE WHEN COUNT(DISTINCT cc.order_id) > 0 THEN SUM(fb.spend) / COUNT(DISTINCT cc.order_id) ELSE 0 END AS cpa,
        CASE WHEN COUNT(DISTINCT cc.order_id) > 0 THEN SUM(COALESCE(cc.subtotal, cc.revenue)) / COUNT(DISTINCT cc.order_id) ELSE 0 END AS aov,
        CASE WHEN SUM(fb.impressions) > 0 THEN SUM(fb.clicks)::FLOAT / SUM(fb.impressions) ELSE 0 END AS ctr,
        CASE WHEN SUM(fb.impressions) > 0 THEN (SUM(fb.spend) / SUM(fb.impressions)) * 1000 ELSE 0 END AS cpm,
        CASE WHEN SUM(fb.clicks) > 0 THEN SUM(fb.spend) / SUM(fb.clicks) ELSE 0 END AS cpc,
        CASE WHEN SUM(fb.clicks) > 0 THEN COUNT(DISTINCT cc.order_id)::FLOAT / SUM(fb.clicks) ELSE 0 END AS cvr,
        COUNT(DISTINCT cc.order_id) AS conversions,
        CASE WHEN COUNT(DISTINCT cc.order_id) > 0
          THEN SUM(CASE WHEN cc.new_customer THEN 1 ELSE 0 END)::FLOAT / COUNT(DISTINCT cc.order_id)
          ELSE 0 END AS new_customer_pct
      FROM fb_ads_today fb
      LEFT JOIN cc_orders_today cc ON fb.ad_set_name = cc.utm_campaign AND cc.order_status = 'completed'
      GROUP BY fb.account_name, cc.offer_name
      ORDER BY spend DESC
    `;
        const coreResult = await db_1.default.query(coreQuery);
        let rows = coreResult.rows.map((r) => ({
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
        }));
        // Extended: take rates
        const takeRatesResult = await db_1.default.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN quantity = 1 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS take_rate_1,
        ROUND((SUM(CASE WHEN quantity = 3 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS take_rate_3,
        ROUND((SUM(CASE WHEN quantity = 5 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS take_rate_5
      FROM cc_orders_today WHERE is_core_sku = true GROUP BY offer_name
    `);
        const takeRatesMap = new Map(takeRatesResult.rows.map((r) => [r.offer_name, r]));
        // Extended: subscription pct
        const subPctResult = await db_1.default.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN subscription_id IS NOT NULL THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS subscription_pct
      FROM cc_orders_today GROUP BY offer_name
    `);
        const subPctMap = new Map(subPctResult.rows.map((r) => [r.offer_name, r]));
        // Extended: sub take rates
        const subTakeResult = await db_1.default.query(`
      SELECT offer_name,
        ROUND((SUM(CASE WHEN quantity = 1 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_1,
        ROUND((SUM(CASE WHEN quantity = 3 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_3,
        ROUND((SUM(CASE WHEN quantity = 5 THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 1) AS sub_take_rate_5
      FROM cc_orders_today WHERE subscription_id IS NOT NULL GROUP BY offer_name
    `);
        const subTakeMap = new Map(subTakeResult.rows.map((r) => [r.offer_name, r]));
        // Extended: upsell rates
        const upsellResult = await db_1.default.query(`
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
        const overridesResult = await db_1.default.query('SELECT metric_key, offer_name, override_value FROM manual_overrides');
        const overrides = overridesResult.rows;
        rows = rows.map((row) => {
            const overridden = {};
            for (const ov of overrides) {
                if (ov.offer_name === 'ALL' || ov.offer_name === row.offer_name) {
                    const key = ov.metric_key;
                    if (key in row && typeof row[key] === 'number') {
                        overridden[ov.metric_key] = true;
                        row[key] = parseFloat(String(ov.override_value));
                    }
                }
            }
            return { ...row, overrides: overridden };
        });
        // Apply filters
        if (offer && offer !== 'All') {
            rows = rows.filter((r) => r.offer_name === offer);
        }
        if (account && account !== 'All') {
            rows = rows.filter((r) => r.account_name === account);
        }
        res.json(rows);
    }
    catch (err) {
        console.error('Error fetching metrics:', err);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});
// GET /api/metrics/summary
router.get('/summary', async (_req, res) => {
    try {
        const result = await db_1.default.query(`
      SELECT
        COALESCE(SUM(fb.spend), 0) AS total_spend,
        COALESCE(SUM(COALESCE(cc.subtotal, cc.revenue)), 0) AS total_revenue,
        CASE WHEN SUM(fb.spend) > 0 THEN SUM(COALESCE(cc.subtotal, cc.revenue)) / SUM(fb.spend) ELSE 0 END AS total_roi,
        COUNT(DISTINCT cc.order_id) AS total_conversions
      FROM fb_ads_today fb
      LEFT JOIN cc_orders_today cc ON fb.ad_set_name = cc.utm_campaign AND cc.order_status = 'completed'
    `);
        const row = result.rows[0];
        res.json({
            total_spend: parseFloat(row.total_spend) || 0,
            total_revenue: parseFloat(row.total_revenue) || 0,
            total_roi: parseFloat(row.total_roi) || 0,
            total_conversions: parseInt(row.total_conversions) || 0,
        });
    }
    catch (err) {
        console.error('Error fetching summary:', err);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});
exports.default = router;
//# sourceMappingURL=metrics.js.map