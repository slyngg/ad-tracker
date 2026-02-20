"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// GET /api/export/csv
router.get('/csv', async (req, res) => {
    try {
        const { offer, account } = req.query;
        const coreResult = await db_1.default.query(`
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
    `);
        let rows = coreResult.rows;
        if (offer && offer !== 'All') {
            rows = rows.filter((r) => r.offer_name === offer);
        }
        if (account && account !== 'All') {
            rows = rows.filter((r) => r.account_name === account);
        }
        const headers = ['Offer', 'Account', 'Spend', 'Revenue', 'ROI', 'CPA', 'AOV', 'CTR', 'CPM', 'CPC', 'CVR', 'Conversions', 'New %'];
        const csvRows = rows.map((r) => [
            `"${r.offer_name}"`,
            `"${r.account_name}"`,
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
        ].join(','));
        const csv = [headers.join(','), ...csvRows].join('\n');
        const date = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="ats-metrics-${date}.csv"`);
        res.send(csv);
    }
    catch (err) {
        console.error('Error exporting CSV:', err);
        res.status(500).json({ error: 'Failed to export CSV' });
    }
});
exports.default = router;
//# sourceMappingURL=export.js.map