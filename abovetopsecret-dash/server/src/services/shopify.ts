import pool from '../db';

interface ShopifyLineItem {
  title: string;
  quantity: number;
}

interface ShopifyOrder {
  id: number;
  order_number?: number;
  total_price: string;
  subtotal_price?: string;
  line_items: ShopifyLineItem[];
  customer?: { orders_count?: number };
  landing_site?: string;
}

export async function processShopifyOrder(order: ShopifyOrder): Promise<string> {
  const orderId = `SHOP-${order.id || order.order_number}`;
  const offerName = order.line_items.length > 0 ? order.line_items[0].title : 'Unknown';
  const revenue = parseFloat(order.total_price || order.subtotal_price || '0');
  const newCustomer = order.customer?.orders_count === 1;

  let utmCampaign = '';
  let fbclid = '';

  if (order.landing_site) {
    try {
      const url = new URL(
        order.landing_site.startsWith('http')
          ? order.landing_site
          : `https://example.com${order.landing_site}`
      );
      utmCampaign = url.searchParams.get('utm_campaign') || '';
      fbclid = url.searchParams.get('fbclid') || '';
    } catch {
      // Ignore parse errors
    }
  }

  const quantity = order.line_items.reduce((sum, item) => sum + (item.quantity || 1), 0);

  await pool.query(
    `INSERT INTO cc_orders_today (order_id, offer_name, revenue, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source)
     VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, true, 'shopify')
     ON CONFLICT (order_id) WHERE user_id IS NULL DO UPDATE SET
       revenue = EXCLUDED.revenue,
       new_customer = EXCLUDED.new_customer,
       quantity = EXCLUDED.quantity`,
    [orderId, offerName, revenue, newCustomer, utmCampaign, fbclid, quantity]
  );

  return orderId;
}
