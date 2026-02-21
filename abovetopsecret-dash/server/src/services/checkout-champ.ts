import pool from '../db';

interface CCOrder {
  order_id: string;
  offer_name: string;
  revenue: number;
  new_customer: boolean;
  utm_campaign: string;
  fbclid: string;
  subscription_id: string | null;
  quantity: number;
  is_core_sku: boolean;
  user_id?: number | null;
}

export async function processCheckoutChampOrder(order: CCOrder): Promise<void> {
  const userId = order.user_id ?? null;
  if (userId != null) {
    await pool.query(
      `INSERT INTO cc_orders_today (order_id, offer_name, revenue, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'checkout_champ', $10)
       ON CONFLICT (user_id, order_id) DO UPDATE SET
         revenue = EXCLUDED.revenue,
         new_customer = EXCLUDED.new_customer,
         subscription_id = EXCLUDED.subscription_id,
         quantity = EXCLUDED.quantity`,
      [order.order_id, order.offer_name, order.revenue, order.new_customer, order.utm_campaign, order.fbclid, order.subscription_id, order.quantity, order.is_core_sku, userId]
    );
  } else {
    // Legacy path: no user_id — uses partial unique index on (order_id) WHERE user_id IS NULL
    await pool.query(
      `INSERT INTO cc_orders_today (order_id, offer_name, revenue, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'checkout_champ')
       ON CONFLICT (order_id) WHERE user_id IS NULL DO UPDATE SET
         revenue = EXCLUDED.revenue,
         new_customer = EXCLUDED.new_customer,
         subscription_id = EXCLUDED.subscription_id,
         quantity = EXCLUDED.quantity`,
      [order.order_id, order.offer_name, order.revenue, order.new_customer, order.utm_campaign, order.fbclid, order.subscription_id, order.quantity, order.is_core_sku]
    );
  }
}

export async function processUpsell(
  orderId: string,
  offered: boolean,
  accepted: boolean,
  offerName: string,
  userId?: number | null
): Promise<void> {
  if (userId != null) {
    await pool.query(
      `INSERT INTO cc_upsells_today (order_id, offered, accepted, offer_name, user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, order_id, offer_name) DO UPDATE SET
         offered = EXCLUDED.offered,
         accepted = EXCLUDED.accepted`,
      [orderId, offered, accepted, offerName, userId]
    );
  } else {
    await pool.query(
      `INSERT INTO cc_upsells_today (order_id, offered, accepted, offer_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (order_id, offer_name) WHERE user_id IS NULL DO UPDATE SET
         offered = EXCLUDED.offered,
         accepted = EXCLUDED.accepted`,
      [orderId, offered, accepted, offerName]
    );
  }
}
