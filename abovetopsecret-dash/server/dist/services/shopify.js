"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processShopifyOrder = processShopifyOrder;
const db_1 = __importDefault(require("../db"));
async function processShopifyOrder(order) {
    const orderId = `SHOP-${order.id || order.order_number}`;
    const offerName = order.line_items.length > 0 ? order.line_items[0].title : 'Unknown';
    const revenue = parseFloat(order.total_price || order.subtotal_price || '0');
    const newCustomer = order.customer?.orders_count === 1;
    let utmCampaign = '';
    let fbclid = '';
    if (order.landing_site) {
        try {
            const url = new URL(order.landing_site.startsWith('http')
                ? order.landing_site
                : `https://example.com${order.landing_site}`);
            utmCampaign = url.searchParams.get('utm_campaign') || '';
            fbclid = url.searchParams.get('fbclid') || '';
        }
        catch {
            // Ignore parse errors
        }
    }
    const quantity = order.line_items.reduce((sum, item) => sum + (item.quantity || 1), 0);
    await db_1.default.query(`INSERT INTO cc_orders_today (order_id, offer_name, revenue, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, true, 'shopify')
     ON CONFLICT (order_id) DO UPDATE SET
       revenue = EXCLUDED.revenue,
       new_customer = EXCLUDED.new_customer,
       quantity = EXCLUDED.quantity`, [orderId, offerName, revenue, newCustomer, utmCampaign, fbclid, quantity]);
    return orderId;
}
//# sourceMappingURL=shopify.js.map