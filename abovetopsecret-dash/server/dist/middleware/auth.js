"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const settings_1 = require("../services/settings");
async function authMiddleware(req, res, next) {
    const authToken = await (0, settings_1.getSetting)('auth_token');
    // Dev mode: if no AUTH_TOKEN is set, skip auth
    if (!authToken) {
        next();
        return;
    }
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
    }
    const token = header.slice(7);
    if (token !== authToken) {
        res.status(401).json({ error: 'Invalid token' });
        return;
    }
    next();
}
//# sourceMappingURL=auth.js.map