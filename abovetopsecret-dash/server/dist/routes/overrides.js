"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../db"));
const router = (0, express_1.Router)();
// GET /api/overrides
router.get('/', async (_req, res) => {
    try {
        const result = await db_1.default.query('SELECT id, metric_key, offer_name, override_value, set_by, set_at FROM manual_overrides ORDER BY set_at DESC');
        res.json(result.rows);
    }
    catch (err) {
        console.error('Error fetching overrides:', err);
        res.status(500).json({ error: 'Failed to fetch overrides' });
    }
});
// POST /api/overrides
router.post('/', async (req, res) => {
    try {
        const { metric_key, offer_name, override_value, set_by } = req.body;
        if (!metric_key || override_value === undefined) {
            res.status(400).json({ error: 'metric_key and override_value are required' });
            return;
        }
        const result = await db_1.default.query(`INSERT INTO manual_overrides (metric_key, offer_name, override_value, set_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING *`, [metric_key, offer_name || 'ALL', override_value, set_by || 'admin']);
        // If no conflict-based insert, do an update approach
        if (result.rows.length === 0) {
            const updateResult = await db_1.default.query(`UPDATE manual_overrides
         SET override_value = $3, set_by = $4, set_at = NOW()
         WHERE metric_key = $1 AND offer_name = $2
         RETURNING *`, [metric_key, offer_name || 'ALL', override_value, set_by || 'admin']);
            if (updateResult.rows.length === 0) {
                // Truly insert
                const insertResult = await db_1.default.query(`INSERT INTO manual_overrides (metric_key, offer_name, override_value, set_by)
           VALUES ($1, $2, $3, $4)
           RETURNING *`, [metric_key, offer_name || 'ALL', override_value, set_by || 'admin']);
                res.json(insertResult.rows[0]);
                return;
            }
            res.json(updateResult.rows[0]);
            return;
        }
        res.json(result.rows[0]);
    }
    catch (err) {
        console.error('Error creating override:', err);
        res.status(500).json({ error: 'Failed to create override' });
    }
});
// DELETE /api/overrides/:id
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db_1.default.query('DELETE FROM manual_overrides WHERE id = $1', [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Error deleting override:', err);
        res.status(500).json({ error: 'Failed to delete override' });
    }
});
exports.default = router;
//# sourceMappingURL=overrides.js.map