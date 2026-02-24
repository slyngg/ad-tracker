import pool from '../db';
import { getSetting, setSetting } from './settings';
import { CheckoutChampClient, formatCCDate } from './checkout-champ-client';
import { matchOffer } from './offer-matcher';

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
  emailAddress?: string;
  email?: string;
  dateCreated?: string;
  date_created?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  items?: any[];
  orderItems?: any[];
}

export async function pollCheckoutChamp(userId?: number): Promise<{ polled: number; inserted: number }> {
  const client = await CheckoutChampClient.fromSettings(userId);
  if (!client) return { polled: 0, inserted: 0 };

  const now = new Date();
  const since = await getLastPollTime(userId);

  let orders: any[];
  try {
    const result = await client.queryOrders({
      startDate: formatCCDate(since),
      endDate: formatCCDate(now),
      resultsPerPage: 200,
    });
    orders = result.data;
  } catch (err) {
    console.error(`[CC Poll] API request failed${userId ? ` for user ${userId}` : ''}:`, err);
    return { polled: 0, inserted: 0 };
  }

  let inserted = 0;

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

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

      const email = (order.emailAddress || order.email || '').toLowerCase();
      const firstName = order.firstName || order.first_name || '';
      const lastName = order.lastName || order.last_name || '';
      const customerName = [firstName, lastName].filter(Boolean).join(' ') || null;
      const conversionTime = order.dateCreated || order.date_created || null;
      const isTest = subtotal < 1.00 ||
        email.startsWith('test@') ||
        email.includes('+test@') ||
        email.endsWith('@example.com');

      try {
        await dbClient.query('SAVEPOINT row_insert');
        await dbClient.query(
          `INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source, utm_source, utm_medium, utm_content, utm_term, user_id, customer_email, customer_name, conversion_time, is_test)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'checkout_champ', $12, $13, $14, $15, $16, $17, $18, $19, $20)
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
             utm_term = EXCLUDED.utm_term,
             is_test = EXCLUDED.is_test,
             customer_email = COALESCE(EXCLUDED.customer_email, cc_orders_today.customer_email),
             customer_name = COALESCE(EXCLUDED.customer_name, cc_orders_today.customer_name),
             conversion_time = COALESCE(EXCLUDED.conversion_time, cc_orders_today.conversion_time)`,
          [orderId, offerName, total, subtotal, tax, orderStatus, newCustomer, utmCampaign, fbclid, subscriptionId, quantity, utmSource, utmMedium, utmContent, utmTerm, userId || null, email || null, customerName, conversionTime, isTest]
        );
        await dbClient.query('RELEASE SAVEPOINT row_insert');
        inserted++;
      } catch (err) {
        await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
        console.error(`[CC Poll] Failed to insert order ${orderId}:`, err);
      }
    }

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error(`[CC Poll] Transaction failed:`, err);
  } finally {
    dbClient.release();
  }

  await setLastPollTime(now, userId);

  // Resolve attribution for polled orders (same as cc-sync post-processing)
  if (userId && inserted > 0) {
    try {
      await resolvePolledOrderAttribution(userId);
    } catch (err) {
      console.error(`[CC Poll] Attribution resolution failed:`, err);
    }
  }

  return { polled: orders.length, inserted };
}

// ── Post-poll attribution (mirrors cc-sync resolveOrderAttribution) ──

const UTM_SOURCE_TO_PLATFORM: Record<string, string> = {
  facebook: 'meta', fb: 'meta', meta: 'meta', instagram: 'meta', ig: 'meta',
  tiktok: 'tiktok', newsbreak: 'newsbreak', google: 'google', bing: 'google',
};

async function resolvePolledOrderAttribution(userId: number): Promise<void> {
  const unattributed = await pool.query(
    `SELECT DISTINCT LOWER(utm_source) AS utm_source
     FROM cc_orders_today
     WHERE user_id = $1 AND account_id IS NULL AND utm_source IS NOT NULL AND utm_source != ''`,
    [userId]
  );
  if (unattributed.rows.length === 0) return;

  const accounts = await pool.query(
    `SELECT id, platform FROM accounts WHERE user_id = $1 AND status = 'active'`,
    [userId]
  );
  const platformToAccountId: Record<string, number> = {};
  for (const a of accounts.rows) {
    if (!platformToAccountId[a.platform] || a.id < platformToAccountId[a.platform]) {
      platformToAccountId[a.platform] = a.id;
    }
  }

  for (const row of unattributed.rows) {
    const platform = UTM_SOURCE_TO_PLATFORM[row.utm_source];
    if (!platform) continue;
    const accountId = platformToAccountId[platform];
    if (!accountId) continue;
    await pool.query(
      `UPDATE cc_orders_today SET account_id = $1
       WHERE user_id = $2 AND account_id IS NULL AND LOWER(utm_source) = $3`,
      [accountId, userId, row.utm_source]
    );
  }

  // Resolve offer_id for orders missing it
  const missingOffer = await pool.query(
    `SELECT order_id, utm_campaign, offer_name
     FROM cc_orders_today
     WHERE user_id = $1 AND offer_id IS NULL AND (utm_campaign IS NOT NULL AND utm_campaign != '')`,
    [userId]
  );
  for (const order of missingOffer.rows) {
    const offerId = await matchOffer(userId, {
      utm_campaign: order.utm_campaign,
      campaign_name: order.offer_name,
    });
    if (offerId) {
      await pool.query(
        `UPDATE cc_orders_today SET offer_id = $1 WHERE user_id = $2 AND order_id = $3`,
        [offerId, userId, order.order_id]
      );
    }
  }
}
