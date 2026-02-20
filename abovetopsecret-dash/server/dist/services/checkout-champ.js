"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCheckoutChampOrder = processCheckoutChampOrder;
exports.processUpsell = processUpsell;
const db_1 = __importDefault(require("../db"));
async function processCheckoutChampOrder(order) {
    await db_1.default.query(`INSERT INTO cc_orders_today (order_id, offer_name, revenue, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'checkout_champ')
     ON CONFLICT (order_id) DO UPDATE SET
       revenue = EXCLUDED.revenue,
       new_customer = EXCLUDED.new_customer,
       subscription_id = EXCLUDED.subscription_id,
       quantity = EXCLUDED.quantity`, [
        order.order_id,
        order.offer_name,
        order.revenue,
        order.new_customer,
        order.utm_campaign,
        order.fbclid,
        order.subscription_id,
        order.quantity,
        order.is_core_sku,
    ]);
}
async function processUpsell(orderId, offered, accepted, offerName) {
    await db_1.default.query(`INSERT INTO cc_upsells_today (order_id, offered, accepted, offer_name)
     VALUES ($1, $2, $3, $4)`, [orderId, offered, accepted, offerName]);
}
//# sourceMappingURL=checkout-champ.js.map