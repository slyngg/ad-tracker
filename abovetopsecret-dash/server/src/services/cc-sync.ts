import pool from '../db';
import { getSetting, setSetting } from './settings';
import { CheckoutChampClient, formatCCDate } from './checkout-champ-client';
import { matchOffer } from './offer-matcher';

// Map utm_source values to platform names in accounts table
const UTM_SOURCE_TO_PLATFORM: Record<string, string> = {
  facebook: 'meta',
  fb: 'meta',
  meta: 'meta',
  instagram: 'meta',
  ig: 'meta',
  tiktok: 'tiktok',
  newsbreak: 'newsbreak',
  google: 'google',
  bing: 'google',
};

// ── Date helpers ───────────────────────────────────────────────

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

// ── Orders (full sync — all statuses, not just completed) ──────

export async function syncCCOrders(userId?: number): Promise<{ synced: number }> {
  const client = await CheckoutChampClient.fromSettings(userId);
  if (!client) return { synced: 0 };

  const now = new Date();
  const since = await getLastSyncTime('cc_last_orders_sync', userId);

  let synced = 0;
  try {
    const orders = await client.queryAllOrders({
      startDate: formatCCDate(since),
      endDate: formatCCDate(now),
      dateRangeType: 'dateUpdated',
    });

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      for (const o of orders) {
        try {
          const orderId = o.orderId || (o as any).order_id;
          if (!orderId) continue;

          const rawStatus = (o.orderStatus || (o as any).order_status || 'completed').toLowerCase();
          const statusMap: Record<string, string> = {
            complete: 'completed', completed: 'completed', paid: 'completed', success: 'completed',
            partial: 'partial', pending: 'pending', processing: 'pending',
            failed: 'failed', declined: 'failed',
            refunded: 'refunded', void: 'refunded', cancelled: 'refunded',
          };
          const orderStatus = statusMap[rawStatus] || 'completed';

          const total = parseFloat(o.totalAmount || (o as any).orderTotal || '0');
          const tax = parseFloat(o.salesTax || (o as any).tax || '0');
          const shipping = parseFloat(o.totalShipping || (o as any).shippingPrice || '0');
          const subtotal = total - tax;

          // Extract product/offer name from items or fields
          const items = o.items || (o as any).orderItems || [];
          const offerName = items.length > 0
            ? (items[0].name || items[0].productName || 'Unknown')
            : ((o as any).campaignName || 'Unknown');

          const email = (o.emailAddress || (o as any).email || '').toLowerCase();
          const isTest = subtotal < 1.00 ||
            email.startsWith('test@') ||
            email.includes('+test@') ||
            email.endsWith('@example.com');

          // UTM sources from CC's sourceValue fields
          const utmCampaign = (o as any).sourceValue1 || (o as any).utm_campaign || '';
          const utmSource = (o as any).sourceValue2 || (o as any).utm_source || '';
          const utmMedium = (o as any).sourceValue3 || (o as any).utm_medium || '';
          const utmContent = (o as any).sourceValue4 || (o as any).utm_content || '';
          const utmTerm = (o as any).sourceValue5 || (o as any).utm_term || '';
          const fbclid = (o as any).fbclid || '';

          const newCustomer = (o as any).isNewCustomer ?? false;
          const quantity = items.reduce((sum: number, i: any) => sum + (parseInt(i.qty || '1') || 1), 0) || 1;

          const firstName = (o as any).firstName || (o as any).first_name || '';
          const lastName = (o as any).lastName || (o as any).last_name || '';
          const customerName = [firstName, lastName].filter(Boolean).join(' ') || null;
          const conversionTime = o.dateCreated || (o as any).date_created || null;
          const subscriptionId = items[0]?.recurringStatus === 'active'
            ? (items[0]?.subscriptionId || items[0]?.purchaseId || (o as any).purchaseId || null)
            : ((o as any).subscriptionId || (o as any).subscription_id || null);

          await dbClient.query('SAVEPOINT row_insert');
          await dbClient.query(
            `INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source, utm_source, utm_medium, utm_content, utm_term, user_id, is_test, customer_email, customer_name, conversion_time)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'checkout_champ', $12, $13, $14, $15, $16, $17, $18, $19, $20)
             ON CONFLICT (user_id, order_id) DO UPDATE SET
               revenue = EXCLUDED.revenue, subtotal = EXCLUDED.subtotal, tax_amount = EXCLUDED.tax_amount,
               order_status = EXCLUDED.order_status, new_customer = EXCLUDED.new_customer,
               quantity = EXCLUDED.quantity, utm_source = EXCLUDED.utm_source,
               utm_medium = EXCLUDED.utm_medium, utm_content = EXCLUDED.utm_content,
               utm_term = EXCLUDED.utm_term, is_test = EXCLUDED.is_test,
               customer_email = COALESCE(EXCLUDED.customer_email, cc_orders_today.customer_email),
               customer_name = COALESCE(EXCLUDED.customer_name, cc_orders_today.customer_name),
               conversion_time = COALESCE(EXCLUDED.conversion_time, cc_orders_today.conversion_time),
               subscription_id = COALESCE(EXCLUDED.subscription_id, cc_orders_today.subscription_id)`,
            [orderId, offerName, total, subtotal, tax, orderStatus, newCustomer, utmCampaign, fbclid, subscriptionId, quantity, utmSource, utmMedium, utmContent, utmTerm, userId || null, isTest, email || null, customerName, conversionTime],
          );
          await dbClient.query('RELEASE SAVEPOINT row_insert');
          synced++;
        } catch (err) {
          await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
          console.error(`[CC Sync] Failed to upsert order:`, err);
        }
      }

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      console.error(`[CC Sync] Orders transaction failed:`, err);
    } finally {
      dbClient.release();
    }

    await setLastSyncTime('cc_last_orders_sync', now, userId);
    if (userId && synced > 0) {
      await resolveOrderAttribution(userId);
    }
    console.log(`[CC Sync] Orders: synced ${synced}${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    console.error(`[CC Sync] Orders fetch failed:`, err);
  }

  return { synced };
}

// ── Post-sync attribution resolution ─────────────────────────────

async function resolveOrderAttribution(userId: number): Promise<number> {
  let resolved = 0;
  try {
    // 1. Find unattributed orders that have utm_source
    const unattributed = await pool.query(
      `SELECT DISTINCT LOWER(utm_source) AS utm_source
       FROM cc_orders_today
       WHERE user_id = $1 AND account_id IS NULL AND utm_source IS NOT NULL AND utm_source != ''`,
      [userId]
    );

    if (unattributed.rows.length === 0) return 0;

    // 2. Get user's accounts indexed by platform
    const accounts = await pool.query(
      `SELECT id, platform FROM accounts WHERE user_id = $1 AND status = 'active'`,
      [userId]
    );
    // Build platform → MIN(account_id) lookup for deterministic assignment
    const platformToAccountId: Record<string, number> = {};
    for (const a of accounts.rows) {
      if (!platformToAccountId[a.platform] || a.id < platformToAccountId[a.platform]) {
        platformToAccountId[a.platform] = a.id;
      }
    }

    // 3. Bulk-update account_id per utm_source
    for (const row of unattributed.rows) {
      const platform = UTM_SOURCE_TO_PLATFORM[row.utm_source];
      if (!platform) continue;
      const accountId = platformToAccountId[platform];
      if (!accountId) continue;

      const res = await pool.query(
        `UPDATE cc_orders_today SET account_id = $1
         WHERE user_id = $2 AND account_id IS NULL AND LOWER(utm_source) = $3`,
        [accountId, userId, row.utm_source]
      );
      resolved += res.rowCount || 0;
    }

    // 4. Resolve offer_id for orders missing it
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

    if (resolved > 0) {
      console.log(`[CC Sync] Attribution: resolved ${resolved} orders for user ${userId}`);
    }
  } catch (err) {
    console.error(`[CC Sync] Attribution resolution failed:`, err);
  }
  return resolved;
}

// ── Purchases (Subscriptions / LTV) ─────────────────────────────

export async function syncCCPurchases(userId?: number): Promise<{ synced: number }> {
  const client = await CheckoutChampClient.fromSettings(userId);
  if (!client) return { synced: 0 };

  const now = new Date();
  const since = await getLastSyncTime('cc_last_purchases_sync', userId);

  let synced = 0;
  try {
    const purchases = await client.queryAllPurchases({
      startDate: formatCCDate(since),
      endDate: formatCCDate(now),
      dateRangeType: 'dateUpdated',
    });

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      for (const p of purchases) {
        try {
          const purchaseId = p.purchaseId || (p as any).purchase_id || (p as any).id;
          if (!purchaseId) continue;

          await dbClient.query('SAVEPOINT row_insert');
          await dbClient.query(
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
              p.orderId || (p as any).order_id || null,
              p.customerId || (p as any).customer_id || null,
              p.productId || (p as any).product_id || null,
              (p.status || (p as any).purchaseType || (p as any).type || 'initial').toLowerCase(),
              parseFloat(p.price || (p as any).amount || (p as any).totalAmount || '0') || 0,
              parseInt(p.qty || (p as any).quantity || '1') || 1,
              (p as any).subscriptionId || (p as any).subscription_id || null,
              parseInt(p.billingCycleNumber || p.billingIntervalDays || (p as any).billing_cycle || '0') || null,
              p.dateCreated || (p as any).purchaseDate || null,
              JSON.stringify(p),
            ]
          );
          await dbClient.query('RELEASE SAVEPOINT row_insert');
          synced++;
        } catch (err) {
          await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
          console.error(`[CC Sync] Failed to upsert purchase:`, err);
        }
      }

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      console.error(`[CC Sync] Purchases transaction failed:`, err);
    } finally {
      dbClient.release();
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
  const client = await CheckoutChampClient.fromSettings(userId);
  if (!client) return { synced: 0 };

  let synced = 0;
  try {
    const campaigns = await client.queryAllCampaigns();

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      for (const c of campaigns) {
        try {
          const campaignId = c.campaignId || (c as any).campaign_id || (c as any).id;
          if (!campaignId) continue;

          await dbClient.query('SAVEPOINT row_insert');
          await dbClient.query(
            `INSERT INTO cc_campaigns (user_id, campaign_id, name, type, funnel_url, offer_name, product_ids, is_active, raw_data, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (user_id, campaign_id) DO UPDATE SET
               name = EXCLUDED.name, type = EXCLUDED.type, funnel_url = EXCLUDED.funnel_url,
               offer_name = EXCLUDED.offer_name, product_ids = EXCLUDED.product_ids,
               is_active = EXCLUDED.is_active, raw_data = EXCLUDED.raw_data, synced_at = NOW()`,
            [
              userId || null,
              String(campaignId),
              c.campaignName || (c as any).name || null,
              c.campaignType || (c as any).type || null,
              (c as any).funnelUrl || (c as any).url || null,
              (c as any).offerName || null,
              JSON.stringify((c as any).productIds || (c as any).products || []),
              c.campaignStatus === 'ACTIVE' || (c as any).isActive !== false,
              JSON.stringify(c),
            ]
          );
          await dbClient.query('RELEASE SAVEPOINT row_insert');
          synced++;
        } catch (err) {
          await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
          console.error(`[CC Sync] Failed to upsert campaign:`, err);
        }
      }

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      console.error(`[CC Sync] Campaigns transaction failed:`, err);
    } finally {
      dbClient.release();
    }

    console.log(`[CC Sync] Campaigns: synced ${synced}${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    console.error(`[CC Sync] Campaigns fetch failed:`, err);
  }

  return { synced };
}

// ── Campaigns ──────────────────────────────────────────────────

export async function syncCCCampaigns(userId?: number): Promise<{ synced: number }> {
  // Alias to syncCCProducts since they share the campaign query
  return syncCCProducts(userId);
}

// ── Full sync orchestrator ─────────────────────────────────────

export async function syncAllCCData(userId?: number): Promise<{
  orders: number;
  purchases: number;
  campaigns: number;
}> {
  const orders = await syncCCOrders(userId);
  const purchases = await syncCCPurchases(userId);
  const campaigns = await syncCCProducts(userId);

  return {
    orders: orders.synced,
    purchases: purchases.synced,
    campaigns: campaigns.synced,
  };
}
