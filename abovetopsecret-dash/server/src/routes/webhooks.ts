import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../db';
import { verifyCheckoutChamp, verifyShopify } from '../middleware/webhook-verify';
import { getRealtime } from '../services/realtime';
import { matchOffer } from '../services/offer-matcher';

const router = Router();

interface WebhookTokenResult {
  userId: number;
  accountId: number | null;
}

// Resolve webhook token to userId + accountId
async function resolveWebhookToken(token: string | undefined): Promise<WebhookTokenResult | null> {
  if (!token) return null;
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
      `UPDATE webhook_tokens SET last_used_at = NOW()
       WHERE token = $1 AND active = true
       RETURNING user_id, account_id`,
      [tokenHash]
    );
    if (result.rows.length > 0) {
      return {
        userId: result.rows[0].user_id,
        accountId: result.rows[0].account_id || null,
      };
    }
  } catch {
    // Table may not exist yet
  }
  return null;
}

// Shared CC webhook handler
async function handleCCWebhook(req: Request, res: Response) {
  try {
    const body = req.body;
    const tokenResult = await resolveWebhookToken(req.params.webhookToken);
    const userId = tokenResult?.userId ?? null;
    const accountId = tokenResult?.accountId ?? null;

    const orderId = body.order_id || body.orderId;
    const offerName = body.offer_name || body.offerName || body.product_name;
    const newCustomer = body.new_customer ?? body.newCustomer ?? false;
    const utmCampaign = body.utm_campaign || body.utmCampaign || '';
    const utmSource = body.utm_source || body.utmSource || '';
    const utmMedium = body.utm_medium || body.utmMedium || '';
    const utmContent = body.utm_content || body.utmContent || '';
    const utmTerm = body.utm_term || body.utmTerm || '';
    const fbclid = body.fbclid || '';
    const subscriptionId = body.subscription_id || body.subscriptionId || null;
    const quantity = parseInt(body.quantity || '1', 10);
    const isCoreSku = body.is_core_sku ?? body.isCoreSku ?? true;

    // Revenue / tax extraction
    const total = parseFloat(body.revenue || body.total || body.amount || '0');
    const taxAmount = parseFloat(body.tax || body.tax_amount || body.salesTax || '0');
    let subtotal: number;

    if (body.subtotal !== undefined) {
      subtotal = parseFloat(body.subtotal);
    } else {
      subtotal = total - taxAmount;
    }

    // Order status
    const rawStatus = (body.order_status || body.orderStatus || body.status || 'completed').toLowerCase();
    const statusMap: Record<string, string> = {
      complete: 'completed',
      completed: 'completed',
      paid: 'completed',
      success: 'completed',
      pending: 'pending',
      processing: 'pending',
      failed: 'failed',
      declined: 'failed',
      refunded: 'refunded',
      void: 'refunded',
      cancelled: 'refunded',
    };
    const orderStatus = statusMap[rawStatus] || 'completed';

    // Test order detection: flag orders with very low amounts or test email patterns
    const email = (body.email || body.customer_email || '').toLowerCase();
    const isTestOrder = subtotal < 1.00 ||
      email.startsWith('test@') ||
      email.includes('+test@') ||
      email.includes('test+') ||
      email.endsWith('@example.com');

    // Match offer based on product/UTM data
    const offerId = userId ? await matchOffer(userId, {
      product_id: body.product_id || body.productId,
      utm_campaign: utmCampaign,
      campaign_name: body.campaign_name || body.campaignName,
    }) : null;

    await pool.query(
      `INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source, utm_source, utm_medium, utm_content, utm_term, user_id, is_test, account_id, offer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'checkout_champ', $13, $14, $15, $16, $17, $18, $19, $20)
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
         account_id = EXCLUDED.account_id,
         offer_id = EXCLUDED.offer_id`,
      [orderId, offerName, total, subtotal, taxAmount, orderStatus, newCustomer, utmCampaign, fbclid, subscriptionId, quantity, isCoreSku, utmSource, utmMedium, utmContent, utmTerm, userId, isTestOrder, accountId, offerId]
    );

    // Handle upsell data if present
    const upsells = body.upsells || body.upsell_data;
    if (Array.isArray(upsells)) {
      for (const upsell of upsells) {
        await pool.query(
          `INSERT INTO cc_upsells_today (order_id, offered, accepted, offer_name, user_id, account_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, order_id, offer_name) DO UPDATE SET
             offered = EXCLUDED.offered,
             accepted = EXCLUDED.accepted`,
          [orderId, upsell.offered ?? true, upsell.accepted ?? false, upsell.offer_name || offerName, userId, accountId]
        );
      }
    }

    // Emit real-time new order event
    getRealtime()?.emitNewOrder(userId, {
      orderId, offerName, revenue: subtotal, status: orderStatus, newCustomer: !!newCustomer, accountId,
    });

    res.json({ success: true, order_id: orderId });
  } catch (err) {
    console.error('Error processing CC webhook:', err);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}

// Shared Shopify webhook handler
async function handleShopifyWebhook(req: Request, res: Response) {
  try {
    const body = req.body;
    const tokenResult = await resolveWebhookToken(req.params.webhookToken);
    const userId = tokenResult?.userId ?? null;
    const accountId = tokenResult?.accountId ?? null;

    const orderId = `SHOP-${body.id || body.order_number}`;
    const lineItems = body.line_items || [];
    const offerName = lineItems.length > 0 ? lineItems[0].title : (body.title || 'Unknown');
    const newCustomer = body.customer?.orders_count === 1;

    // Use subtotal_price (excludes tax), total_price as gross
    const totalPrice = parseFloat(body.total_price || '0');
    const subtotalPrice = parseFloat(body.subtotal_price || body.total_price || '0');
    const totalTax = parseFloat(body.total_tax || '0');

    // Map financial_status to our order_status
    const financialStatus = (body.financial_status || '').toLowerCase();
    let orderStatus = 'completed';
    if (financialStatus === 'paid' || financialStatus === 'partially_paid') {
      orderStatus = 'completed';
    } else if (financialStatus === 'pending' || financialStatus === 'authorized') {
      orderStatus = 'pending';
    } else if (financialStatus === 'refunded' || financialStatus === 'partially_refunded' || financialStatus === 'voided') {
      orderStatus = 'refunded';
    }

    // Extract UTMs from landing_site
    let utmCampaign = '';
    let utmSource = '';
    let utmMedium = '';
    let utmContent = '';
    let utmTerm = '';
    let fbclid = '';
    const landingSite = body.landing_site || '';
    if (landingSite) {
      try {
        const url = new URL(landingSite.startsWith('http') ? landingSite : `https://example.com${landingSite}`);
        utmCampaign = url.searchParams.get('utm_campaign') || '';
        utmSource = url.searchParams.get('utm_source') || '';
        utmMedium = url.searchParams.get('utm_medium') || '';
        utmContent = url.searchParams.get('utm_content') || '';
        utmTerm = url.searchParams.get('utm_term') || '';
        fbclid = url.searchParams.get('fbclid') || '';
      } catch {
        // Ignore parse errors
      }
    }

    const quantity = lineItems.reduce((sum: number, item: { quantity?: number }) => sum + (item.quantity || 1), 0);

    // Test order detection
    const email = (body.email || body.contact_email || '').toLowerCase();
    const isTestOrder = subtotalPrice < 1.00 ||
      email.startsWith('test@') ||
      email.includes('+test@') ||
      email.includes('test+') ||
      email.endsWith('@example.com') ||
      body.test === true;

    // Match offer based on product/UTM data
    const productId = lineItems.length > 0 ? String(lineItems[0].product_id || '') : undefined;
    const offerId = userId ? await matchOffer(userId, {
      product_id: productId,
      utm_campaign: utmCampaign,
      campaign_name: utmCampaign,
    }) : null;

    await pool.query(
      `INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source, utm_source, utm_medium, utm_content, utm_term, user_id, is_test, account_id, offer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, true, 'shopify', $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (user_id, order_id) DO UPDATE SET
         revenue = EXCLUDED.revenue,
         subtotal = EXCLUDED.subtotal,
         tax_amount = EXCLUDED.tax_amount,
         order_status = EXCLUDED.order_status,
         new_customer = EXCLUDED.new_customer,
         quantity = EXCLUDED.quantity,
         utm_source = EXCLUDED.utm_source,
         utm_medium = EXCLUDED.utm_medium,
         utm_content = EXCLUDED.utm_content,
         utm_term = EXCLUDED.utm_term,
         is_test = EXCLUDED.is_test,
         account_id = EXCLUDED.account_id,
         offer_id = EXCLUDED.offer_id`,
      [orderId, offerName, totalPrice, subtotalPrice, totalTax, orderStatus, newCustomer, utmCampaign, fbclid, quantity, utmSource, utmMedium, utmContent, utmTerm, userId, isTestOrder, accountId, offerId]
    );

    // Emit real-time new order event
    getRealtime()?.emitNewOrder(userId, {
      orderId, offerName, revenue: subtotalPrice, status: orderStatus, newCustomer: !!newCustomer, accountId,
    });

    res.json({ success: true, order_id: orderId });
  } catch (err) {
    console.error('Error processing Shopify webhook:', err);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}

// Token-based routes (preferred)
router.post('/checkout-champ/:webhookToken', verifyCheckoutChamp, handleCCWebhook);
router.post('/shopify/:webhookToken', verifyShopify, handleShopifyWebhook);

// Legacy routes (backward compat)
router.post('/checkout-champ', verifyCheckoutChamp, handleCCWebhook);
router.post('/shopify', verifyShopify, handleShopifyWebhook);

export default router;
