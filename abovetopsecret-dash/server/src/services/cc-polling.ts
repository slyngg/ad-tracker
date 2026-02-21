import pool from '../db';
import https from 'https';
import { getSetting, setSetting } from './settings';

async function getLastPollTime(userId?: number): Promise<Date> {
  const key = 'cc_last_poll_time';
  const val = await getSetting(key, userId);
  if (val) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() - 2 * 60 * 1000); // Default: 2 minutes ago
}

async function setLastPollTime(now: Date, userId?: number): Promise<void> {
  await setSetting('cc_last_poll_time', now.toISOString(), 'system', userId);
}

function fetchJSON(url: string, apiKey: string): Promise<{ data?: CCOrder[]; message?: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.end();
  });
}

interface CCOrder {
  orderId?: string;
  order_id?: string;
  orderStatus?: string;
  order_status?: string;
  status?: string;
  totalAmount?: string;
  total_amount?: string;
  total?: string;
  subTotal?: string;
  sub_total?: string;
  subtotal?: string;
  salesTax?: string;
  sales_tax?: string;
  tax?: string;
  productName?: string;
  product_name?: string;
  offer_name?: string;
  isNewCustomer?: boolean;
  new_customer?: boolean;
  utmCampaign?: string;
  utm_campaign?: string;
  utmSource?: string;
  utm_source?: string;
  utmMedium?: string;
  utm_medium?: string;
  utmContent?: string;
  utm_content?: string;
  utmTerm?: string;
  utm_term?: string;
  fbclid?: string;
  subscriptionId?: string;
  subscription_id?: string;
  quantity?: number;
}

function formatDate(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export async function pollCheckoutChamp(userId?: number): Promise<{ polled: number; inserted: number }> {
  const apiKey = await getSetting('cc_api_key', userId);
  const apiUrl = await getSetting('cc_api_url', userId);

  if (!apiKey || !apiUrl) {
    return { polled: 0, inserted: 0 };
  }

  const now = new Date();
  const since = await getLastPollTime(userId);

  const url = `${apiUrl.replace(/\/$/, '')}/orders?startDate=${encodeURIComponent(formatDate(since))}&endDate=${encodeURIComponent(formatDate(now))}`;

  let response;
  try {
    response = await fetchJSON(url, apiKey);
  } catch (err) {
    console.error(`[CC Poll] API request failed${userId ? ` for user ${userId}` : ''}:`, err);
    return { polled: 0, inserted: 0 };
  }

  const orders = response.data || [];
  let inserted = 0;

  for (const order of orders) {
    const orderId = order.orderId || order.order_id;
    if (!orderId) continue;

    const rawStatus = (order.orderStatus || order.order_status || order.status || 'completed').toLowerCase();
    const statusMap: Record<string, string> = {
      complete: 'completed', completed: 'completed', paid: 'completed', success: 'completed',
      pending: 'pending', processing: 'pending',
      failed: 'failed', declined: 'failed',
      refunded: 'refunded', void: 'refunded', cancelled: 'refunded',
    };
    const orderStatus = statusMap[rawStatus] || 'completed';

    // Only insert successful orders
    if (orderStatus !== 'completed') continue;

    const total = parseFloat(order.totalAmount || order.total_amount || order.total || '0');
    const tax = parseFloat(order.salesTax || order.sales_tax || order.tax || '0');
    const subtotal = order.subTotal || order.sub_total || order.subtotal
      ? parseFloat(String(order.subTotal || order.sub_total || order.subtotal))
      : total - tax;

    const offerName = order.productName || order.product_name || order.offer_name || 'Unknown';
    const newCustomer = order.isNewCustomer ?? order.new_customer ?? false;
    const utmCampaign = order.utmCampaign || order.utm_campaign || '';
    const utmSource = order.utmSource || order.utm_source || '';
    const utmMedium = order.utmMedium || order.utm_medium || '';
    const utmContent = order.utmContent || order.utm_content || '';
    const utmTerm = order.utmTerm || order.utm_term || '';
    const fbclid = order.fbclid || '';
    const subscriptionId = order.subscriptionId || order.subscription_id || null;
    const quantity = order.quantity || 1;

    try {
      await pool.query(
        `INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source, utm_source, utm_medium, utm_content, utm_term, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'checkout_champ', $12, $13, $14, $15, $16)
         ON CONFLICT (user_id, order_id) DO UPDATE SET
           revenue = EXCLUDED.revenue,
           subtotal = EXCLUDED.subtotal,
           tax_amount = EXCLUDED.tax_amount,
           order_status = EXCLUDED.order_status,
           new_customer = EXCLUDED.new_customer,
           subscription_id = EXCLUDED.subscription_id,
           quantity = EXCLUDED.quantity,
           utm_source = EXCLUDED.utm_source,
           utm_medium = EXCLUDED.utm_medium,
           utm_content = EXCLUDED.utm_content,
           utm_term = EXCLUDED.utm_term`,
        [orderId, offerName, total, subtotal, tax, orderStatus, newCustomer, utmCampaign, fbclid, subscriptionId, quantity, utmSource, utmMedium, utmContent, utmTerm, userId || null]
      );
      inserted++;
    } catch (err) {
      console.error(`[CC Poll] Failed to insert order ${orderId}:`, err);
    }
  }

  await setLastPollTime(now, userId);
  return { polled: orders.length, inserted };
}
