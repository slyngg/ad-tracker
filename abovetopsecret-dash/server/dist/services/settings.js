"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSetting = getSetting;
exports.setSetting = setSetting;
exports.deleteSetting = deleteSetting;
exports.getAllSettings = getAllSettings;
const db_1 = __importDefault(require("../db"));
const SENSITIVE_KEYS = [
    'fb_access_token',
    'cc_api_key',
    'cc_webhook_secret',
    'shopify_webhook_secret',
    'auth_token',
];
// Environment variable fallback mapping
const ENV_FALLBACKS = {
    fb_access_token: 'FB_ACCESS_TOKEN',
    fb_ad_account_ids: 'FB_AD_ACCOUNT_IDS',
    cc_webhook_secret: 'CC_WEBHOOK_SECRET',
    shopify_webhook_secret: 'SHOPIFY_WEBHOOK_SECRET',
    auth_token: 'AUTH_TOKEN',
};
async function getSetting(key) {
    try {
        const result = await db_1.default.query('SELECT value FROM app_settings WHERE key = $1', [key]);
        if (result.rows.length > 0) {
            return result.rows[0].value;
        }
    }
    catch {
        // Table may not exist yet during startup
    }
    // Fall back to environment variable
    const envKey = ENV_FALLBACKS[key];
    if (envKey) {
        return process.env[envKey] || undefined;
    }
    return undefined;
}
async function setSetting(key, value, updatedBy = 'admin') {
    await db_1.default.query(`INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`, [key, value, updatedBy]);
}
async function deleteSetting(key) {
    await db_1.default.query('DELETE FROM app_settings WHERE key = $1', [key]);
}
function maskValue(key, value) {
    if (SENSITIVE_KEYS.includes(key) && value.length > 4) {
        return '****' + value.slice(-4);
    }
    return value;
}
async function getAllSettings() {
    const result = {};
    try {
        const dbResult = await db_1.default.query('SELECT key, value FROM app_settings ORDER BY key');
        for (const row of dbResult.rows) {
            result[row.key] = maskValue(row.key, row.value);
        }
    }
    catch {
        // Table may not exist yet
    }
    // Include env var fallbacks that aren't already in DB (masked)
    for (const [settingKey, envKey] of Object.entries(ENV_FALLBACKS)) {
        if (!(settingKey in result) && process.env[envKey]) {
            result[settingKey] = maskValue(settingKey, process.env[envKey]);
            result[`${settingKey}_source`] = 'env';
        }
    }
    return result;
}
//# sourceMappingURL=settings.js.map