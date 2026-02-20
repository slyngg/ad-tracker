"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const facebook_sync_1 = require("./facebook-sync");
const cc_polling_1 = require("./cc-polling");
const settings_1 = require("./settings");
const db_1 = __importDefault(require("../db"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function startScheduler() {
    // Facebook sync every 10 minutes
    node_cron_1.default.schedule('*/10 * * * *', async () => {
        console.log('[Scheduler] Running Facebook sync...');
        try {
            const result = await (0, facebook_sync_1.syncFacebook)();
            console.log(`[Scheduler] FB sync complete: ${result.synced} rows from ${result.accounts} accounts`);
        }
        catch (err) {
            console.error('[Scheduler] FB sync failed:', err);
        }
    });
    // CheckoutChamp API polling every minute
    node_cron_1.default.schedule('* * * * *', async () => {
        try {
            const pollEnabled = await (0, settings_1.getSetting)('cc_poll_enabled');
            if (pollEnabled === 'false')
                return;
            const result = await (0, cc_polling_1.pollCheckoutChamp)();
            if (result.inserted > 0) {
                console.log(`[Scheduler] CC poll: ${result.inserted} orders inserted (${result.polled} total)`);
            }
        }
        catch (err) {
            console.error('[Scheduler] CC poll failed:', err);
        }
    });
    // Daily reset at midnight
    node_cron_1.default.schedule('0 0 * * *', async () => {
        console.log('[Scheduler] Running daily reset...');
        try {
            const resetSql = fs_1.default.readFileSync(path_1.default.join(__dirname, '../../db/reset-daily.sql'), 'utf-8');
            await db_1.default.query(resetSql);
            console.log('[Scheduler] Daily reset complete');
        }
        catch (err) {
            // Fallback: run inline if file not found
            console.warn('[Scheduler] Could not read reset-daily.sql, running inline reset');
            try {
                await db_1.default.query(`
          INSERT INTO fb_ads_archive (archived_date, ad_data)
          SELECT CURRENT_DATE, row_to_json(fb_ads_today)::jsonb FROM fb_ads_today;

          INSERT INTO orders_archive (archived_date, order_data)
          SELECT CURRENT_DATE, row_to_json(cc_orders_today)::jsonb FROM cc_orders_today;

          TRUNCATE fb_ads_today RESTART IDENTITY;
          TRUNCATE cc_orders_today RESTART IDENTITY;
          TRUNCATE cc_upsells_today RESTART IDENTITY;
        `);
                console.log('[Scheduler] Inline daily reset complete');
            }
            catch (innerErr) {
                console.error('[Scheduler] Daily reset failed:', innerErr);
            }
        }
    });
    console.log('[Scheduler] Cron jobs registered: FB sync (*/10 * * * *), CC poll (* * * * *), Daily reset (0 0 * * *)');
}
//# sourceMappingURL=scheduler.js.map