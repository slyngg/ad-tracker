"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const facebook_sync_1 = require("../services/facebook-sync");
const router = (0, express_1.Router)();
// POST /api/sync/facebook
router.post('/facebook', async (_req, res) => {
    try {
        const result = await (0, facebook_sync_1.syncFacebook)();
        res.json(result);
    }
    catch (err) {
        console.error('Error triggering FB sync:', err);
        res.status(500).json({ error: 'Failed to sync Facebook data' });
    }
});
exports.default = router;
//# sourceMappingURL=sync.js.map