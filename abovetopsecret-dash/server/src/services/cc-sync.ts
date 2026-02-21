import pool from '../db';
import https from 'https';
import { getSetting, setSetting } from './settings';

// ── HTTP helper (mirrors cc-polling.ts) ────────────────────────

function fetchJSON(url: string, apiKey: string): Promise<any> {
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
      res.on('data', (chunk: string) => (data += chunk));
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

// ── Date helpers ───────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

async function getLastSyncTime(key: string, userId?: number): Promise<Date> {
  const val = await getSetting(key, userId);
  if (val) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  // Default: 90 days ago for initial full pull
  return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
}

async function setLastSyncTime(key: string, now: Date, userId?: number): Promise<void> {
  await setSetting(key, now.toISOString(), 'system', userId);
}

// ── Paginated fetch helper ─────────────────────────────────────

async function fetchAllPages(
  baseUrl: string,
  apiKey: string,
  useDateRange: boolean,
  startDate?: Date,
  endDate?: Date,
): Promise<any[]> {
  const allData: any[] = [];
  let page = 1;

  while (true) {
    let url = `${baseUrl}?resultsPerPage=500&page=${page}`;
    if (useDateRange && startDate && endDate) {
      url += `&startDate=${encodeURIComponent(formatDate(startDate))}&endDate=${encodeURIComponent(formatDate(endDate))}`;
    }

    const response = await fetchJSON(url, apiKey);
    const data = response.data || response.Data || [];

    if (!Array.isArray(data) || data.length === 0) break;

    allData.push(...data);

    if (data.length < 500) break;
    page++;
  }

  return allData;
}

// ── Customers ──────────────────────────────────────────────────

export async function syncCCCustomers(userId?: number): Promise<{ synced: number }> {
  const apiKey = await getSetting('cc_api_key', userId);
  const apiUrl = await getSetting('cc_api_url', userId);
  if (!apiKey || !apiUrl) return { synced: 0 };

  const baseUrl = `${apiUrl.replace(/\/$/, '')}/customers/query`;
  const now = new Date();
  const since = await getLastSyncTime('cc_last_customers_sync', userId);

  let synced = 0;
  try {
    const customers = await fetchAllPages(baseUrl, apiKey, true, since, now);

    for (const c of customers) {
      try {
        const customerId = c.customerId || c.customer_id || c.id;
        if (!customerId) continue;

        await pool.query(
          `INSERT INTO cc_customers (user_id, customer_id, email, name, phone, address, total_orders, total_revenue, first_order_date, last_order_date, customer_type, raw_data, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
           ON CONFLICT (user_id, customer_id) DO UPDATE SET
             email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone,
             address = EXCLUDED.address, total_orders = EXCLUDED.total_orders,
             total_revenue = EXCLUDED.total_revenue, first_order_date = EXCLUDED.first_order_date,
             last_order_date = EXCLUDED.last_order_date, customer_type = EXCLUDED.customer_type,
             raw_data = EXCLUDED.raw_data, synced_at = NOW()`,
          [
            userId || null,
            String(customerId),
            c.email || c.emailAddress || c.email_address || null,
            c.name || c.firstName || c.first_name
              ? `${c.firstName || c.first_name || ''} ${c.lastName || c.last_name || ''}`.trim() || c.name
              : null,
            c.phone || c.phoneNumber || c.phone_number || null,
            c.address || c.shippingAddress || c.shipping_address || null,
            parseInt(c.totalOrders || c.total_orders || c.orderCount || c.order_count || '0') || 0,
            parseFloat(c.totalRevenue || c.total_revenue || c.lifetimeValue || c.lifetime_value || '0') || 0,
            c.firstOrderDate || c.first_order_date || c.dateCreated || c.date_created || null,
            c.lastOrderDate || c.last_order_date || c.lastOrder || c.last_order || null,
            c.customerType || c.customer_type || c.type || null,
            JSON.stringify(c),
          ]
        );
        synced++;
      } catch (err) {
        console.error(`[CC Sync] Failed to upsert customer:`, err);
      }
    }

    await setLastSyncTime('cc_last_customers_sync', now, userId);
    console.log(`[CC Sync] Customers: synced ${synced}${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    console.error(`[CC Sync] Customers fetch failed:`, err);
  }

  return { synced };
}

// ── Transactions ───────────────────────────────────────────────

export async function syncCCTransactions(userId?: number): Promise<{ synced: number }> {
  const apiKey = await getSetting('cc_api_key', userId);
  const apiUrl = await getSetting('cc_api_url', userId);
  if (!apiKey || !apiUrl) return { synced: 0 };

  const baseUrl = `${apiUrl.replace(/\/$/, '')}/transactions/query`;
  const now = new Date();
  const since = await getLastSyncTime('cc_last_transactions_sync', userId);

  let synced = 0;
  try {
    const transactions = await fetchAllPages(baseUrl, apiKey, true, since, now);

    for (const t of transactions) {
      try {
        const transactionId = t.transactionId || t.transaction_id || t.id;
        if (!transactionId) continue;

        const rawType = (t.transactionType || t.transaction_type || t.type || 'sale').toLowerCase();
        const isChargeback = rawType === 'chargeback' || t.isChargeback || t.is_chargeback || false;

        await pool.query(
          `INSERT INTO cc_transactions (user_id, transaction_id, order_id, customer_id, type, amount, payment_method, processor, response, is_chargeback, transaction_date, raw_data, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
           ON CONFLICT (user_id, transaction_id) DO UPDATE SET
             order_id = EXCLUDED.order_id, customer_id = EXCLUDED.customer_id,
             type = EXCLUDED.type, amount = EXCLUDED.amount,
             payment_method = EXCLUDED.payment_method, processor = EXCLUDED.processor,
             response = EXCLUDED.response, is_chargeback = EXCLUDED.is_chargeback,
             transaction_date = EXCLUDED.transaction_date, raw_data = EXCLUDED.raw_data, synced_at = NOW()`,
          [
            userId || null,
            String(transactionId),
            t.orderId || t.order_id || null,
            t.customerId || t.customer_id || null,
            rawType,
            parseFloat(t.amount || t.totalAmount || t.total_amount || '0') || 0,
            t.paymentMethod || t.payment_method || t.cardType || t.card_type || null,
            t.processor || t.gateway || null,
            t.response || t.responseMessage || t.response_message || null,
            isChargeback,
            t.transactionDate || t.transaction_date || t.dateCreated || t.date_created || null,
            JSON.stringify(t),
          ]
        );
        synced++;
      } catch (err) {
        console.error(`[CC Sync] Failed to upsert transaction:`, err);
      }
    }

    await setLastSyncTime('cc_last_transactions_sync', now, userId);
    console.log(`[CC Sync] Transactions: synced ${synced}${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    console.error(`[CC Sync] Transactions fetch failed:`, err);
  }

  return { synced };
}

// ── Purchases ──────────────────────────────────────────────────

export async function syncCCPurchases(userId?: number): Promise<{ synced: number }> {
  const apiKey = await getSetting('cc_api_key', userId);
  const apiUrl = await getSetting('cc_api_url', userId);
  if (!apiKey || !apiUrl) return { synced: 0 };

  const baseUrl = `${apiUrl.replace(/\/$/, '')}/purchases/query`;
  const now = new Date();
  const since = await getLastSyncTime('cc_last_purchases_sync', userId);

  let synced = 0;
  try {
    const purchases = await fetchAllPages(baseUrl, apiKey, true, since, now);

    for (const p of purchases) {
      try {
        const purchaseId = p.purchaseId || p.purchase_id || p.id;
        if (!purchaseId) continue;

        await pool.query(
          `INSERT INTO cc_purchases (user_id, purchase_id, order_id, customer_id, product_id, purchase_type, amount, quantity, subscription_id, billing_cycle, purchase_date, raw_data, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
           ON CONFLICT (user_id, purchase_id) DO UPDATE SET
             order_id = EXCLUDED.order_id, customer_id = EXCLUDED.customer_id,
             product_id = EXCLUDED.product_id, purchase_type = EXCLUDED.purchase_type,
             amount = EXCLUDED.amount, quantity = EXCLUDED.quantity,
             subscription_id = EXCLUDED.subscription_id, billing_cycle = EXCLUDED.billing_cycle,
             purchase_date = EXCLUDED.purchase_date, raw_data = EXCLUDED.raw_data, synced_at = NOW()`,
          [
            userId || null,
            String(purchaseId),
            p.orderId || p.order_id || null,
            p.customerId || p.customer_id || null,
            p.productId || p.product_id || null,
            (p.purchaseType || p.purchase_type || p.type || 'initial').toLowerCase(),
            parseFloat(p.amount || p.price || p.totalAmount || p.total_amount || '0') || 0,
            parseInt(p.quantity || '1') || 1,
            p.subscriptionId || p.subscription_id || null,
            parseInt(p.billingCycle || p.billing_cycle || '0') || null,
            p.purchaseDate || p.purchase_date || p.dateCreated || p.date_created || null,
            JSON.stringify(p),
          ]
        );
        synced++;
      } catch (err) {
        console.error(`[CC Sync] Failed to upsert purchase:`, err);
      }
    }

    await setLastSyncTime('cc_last_purchases_sync', now, userId);
    console.log(`[CC Sync] Purchases: synced ${synced}${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    console.error(`[CC Sync] Purchases fetch failed:`, err);
  }

  return { synced };
}

// ── Products (no date filter — full catalog) ───────────────────

export async function syncCCProducts(userId?: number): Promise<{ synced: number }> {
  const apiKey = await getSetting('cc_api_key', userId);
  const apiUrl = await getSetting('cc_api_url', userId);
  if (!apiKey || !apiUrl) return { synced: 0 };

  const baseUrl = `${apiUrl.replace(/\/$/, '')}/products/query`;

  let synced = 0;
  try {
    const products = await fetchAllPages(baseUrl, apiKey, false);

    for (const p of products) {
      try {
        const productId = p.productId || p.product_id || p.id;
        if (!productId) continue;

        await pool.query(
          `INSERT INTO cc_products (user_id, product_id, name, sku, price, cost, category, is_subscription, rebill_days, trial_days, status, raw_data, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
           ON CONFLICT (user_id, product_id) DO UPDATE SET
             name = EXCLUDED.name, sku = EXCLUDED.sku, price = EXCLUDED.price,
             cost = EXCLUDED.cost, category = EXCLUDED.category,
             is_subscription = EXCLUDED.is_subscription, rebill_days = EXCLUDED.rebill_days,
             trial_days = EXCLUDED.trial_days, status = EXCLUDED.status,
             raw_data = EXCLUDED.raw_data, synced_at = NOW()`,
          [
            userId || null,
            String(productId),
            p.name || p.productName || p.product_name || null,
            p.sku || p.SKU || null,
            parseFloat(p.price || p.basePrice || p.base_price || '0') || 0,
            parseFloat(p.cost || p.productCost || p.product_cost || '0') || 0,
            p.category || p.productCategory || p.product_category || null,
            p.isSubscription || p.is_subscription || p.recurring || false,
            parseInt(p.rebillDays || p.rebill_days || '0') || null,
            parseInt(p.trialDays || p.trial_days || '0') || null,
            p.status || p.productStatus || p.product_status || 'active',
            JSON.stringify(p),
          ]
        );
        synced++;
      } catch (err) {
        console.error(`[CC Sync] Failed to upsert product:`, err);
      }
    }

    console.log(`[CC Sync] Products: synced ${synced}${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    console.error(`[CC Sync] Products fetch failed:`, err);
  }

  return { synced };
}

// ── Campaigns (no date filter — full catalog) ──────────────────

export async function syncCCCampaigns(userId?: number): Promise<{ synced: number }> {
  const apiKey = await getSetting('cc_api_key', userId);
  const apiUrl = await getSetting('cc_api_url', userId);
  if (!apiKey || !apiUrl) return { synced: 0 };

  const baseUrl = `${apiUrl.replace(/\/$/, '')}/campaigns/query`;

  let synced = 0;
  try {
    const campaigns = await fetchAllPages(baseUrl, apiKey, false);

    for (const c of campaigns) {
      try {
        const campaignId = c.campaignId || c.campaign_id || c.id;
        if (!campaignId) continue;

        await pool.query(
          `INSERT INTO cc_campaigns (user_id, campaign_id, name, type, funnel_url, offer_name, product_ids, is_active, raw_data, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
           ON CONFLICT (user_id, campaign_id) DO UPDATE SET
             name = EXCLUDED.name, type = EXCLUDED.type, funnel_url = EXCLUDED.funnel_url,
             offer_name = EXCLUDED.offer_name, product_ids = EXCLUDED.product_ids,
             is_active = EXCLUDED.is_active, raw_data = EXCLUDED.raw_data, synced_at = NOW()`,
          [
            userId || null,
            String(campaignId),
            c.name || c.campaignName || c.campaign_name || null,
            c.type || c.campaignType || c.campaign_type || null,
            c.funnelUrl || c.funnel_url || c.url || null,
            c.offerName || c.offer_name || null,
            JSON.stringify(c.productIds || c.product_ids || c.products || []),
            c.isActive !== undefined ? c.isActive : (c.is_active !== undefined ? c.is_active : (c.status === 'active' || c.status === 'Active' || true)),
            JSON.stringify(c),
          ]
        );
        synced++;
      } catch (err) {
        console.error(`[CC Sync] Failed to upsert campaign:`, err);
      }
    }

    console.log(`[CC Sync] Campaigns: synced ${synced}${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    console.error(`[CC Sync] Campaigns fetch failed:`, err);
  }

  return { synced };
}

// ── Full sync orchestrator ─────────────────────────────────────

export async function syncAllCCData(userId?: number): Promise<{
  customers: number;
  transactions: number;
  purchases: number;
  products: number;
  campaigns: number;
}> {
  const customers = await syncCCCustomers(userId);
  const transactions = await syncCCTransactions(userId);
  const purchases = await syncCCPurchases(userId);
  const products = await syncCCProducts(userId);
  const campaigns = await syncCCCampaigns(userId);

  return {
    customers: customers.synced,
    transactions: transactions.synced,
    purchases: purchases.synced,
    products: products.synced,
    campaigns: campaigns.synced,
  };
}
