"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyCheckoutChamp = verifyCheckoutChamp;
exports.verifyShopify = verifyShopify;
const crypto_1 = __importDefault(require("crypto"));
const settings_1 = require("../services/settings");
async function verifyCheckoutChamp(req, res, next) {
    const secret = await (0, settings_1.getSetting)('cc_webhook_secret');
    if (!secret) {
        // No secret configured, allow in dev mode
        next();
        return;
    }
    const signature = req.headers['x-cc-signature'];
    if (!signature) {
        res.status(401).json({ error: 'Missing X-CC-Signature header' });
        return;
    }
    const body = JSON.stringify(req.body);
    const expected = crypto_1.default.createHmac('sha256', secret).update(body).digest('hex');
    if (!crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
    }
    next();
}
async function verifyShopify(req, res, next) {
    const secret = await (0, settings_1.getSetting)('shopify_webhook_secret');
    if (!secret) {
        next();
        return;
    }
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    if (!hmacHeader) {
        res.status(401).json({ error: 'Missing X-Shopify-Hmac-Sha256 header' });
        return;
    }
    const body = JSON.stringify(req.body);
    const expected = crypto_1.default.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
    if (!crypto_1.default.timingSafeEqual(Buffer.from(hmacHeader), Buffer.from(expected))) {
        res.status(401).json({ error: 'Invalid HMAC' });
        return;
    }
    next();
}
//# sourceMappingURL=webhook-verify.js.map