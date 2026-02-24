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

// ── CC Event Type Detection ─────────────────────────────────────
// Checkout Champ postback exports don't have a standard event_type field.
// Users can add one via field mapping, or we infer from payload content.

type CCEventType =
  | 'new_sale' | 'upsell' | 'decline' | 'capture'
  | 'partial' | 'lead' | 'cod_pending'
  | 'subscription_started' | 'recurring_order' | 'rebill_decline'
  | 'pre_billing' | 'recycle_failed' | 'cancel' | 'pause' | 'reactivate'
  | 'full_refund' | 'partial_refund' | 'chargeback'
  | 'fulfillment_shipped' | 'fulfillment_delivered' | 'rma_issued' | 'rma_received'
  | 'customer_update'
  | 'unknown';

function detectEventType(body: any): CCEventType {
  // Explicit event_type from field mapping (recommended CC config)
  const explicit = (body.event_type || body.eventType || body.event || '').toLowerCase().replace(/[\s-]/g, '_');
  const explicitMap: Record<string, CCEventType> = {
    new_sale: 'new_sale', sale: 'new_sale',
    upsell: 'upsell', upsale: 'upsell',
    decline: 'decline', declined: 'decline',
    capture: 'capture',
    partial: 'partial', partial_order: 'partial',
    lead: 'lead',
    cod_pending: 'cod_pending',
    subscription_started: 'subscription_started', sub_started: 'subscription_started',
    recurring_order: 'recurring_order', recurring: 'recurring_order', rebill: 'recurring_order',
    rebill_decline: 'rebill_decline', rebill_declined: 'rebill_decline',
    pre_billing: 'pre_billing', prebill: 'pre_billing', pre_bill: 'pre_billing',
    recycle_failed: 'recycle_failed',
    cancel: 'cancel', cancelled: 'cancel', canceled: 'cancel',
    pause: 'pause', paused: 'pause',
    reactivate: 'reactivate', reactivated: 'reactivate',
    full_refund: 'full_refund', refund: 'full_refund',
    partial_refund: 'partial_refund',
    chargeback: 'chargeback',
    fulfillment_shipped: 'fulfillment_shipped', shipped: 'fulfillment_shipped',
    fulfillment_delivered: 'fulfillment_delivered', delivered: 'fulfillment_delivered',
    rma_issued: 'rma_issued', rma: 'rma_issued',
    rma_received: 'rma_received', returned: 'rma_received',
    customer_update: 'customer_update',
  };
  if (explicit && explicitMap[explicit]) return explicitMap[explicit];

  // Infer from payload content
  if (body.chargebackAmount || body.chargeback_amount || body.chargebackDate || body.chargeback_date) return 'chargeback';
  if (body.dateRefunded || body.date_refunded || body.refundReason || body.refund_reason) {
    const refundAmt = parseFloat(body.refundAmount || body.refund_amount || '0');
    const orderTotal = parseFloat(body.orderTotal || body.order_total || body.totalAmount || body.total_amount || '0');
    return (refundAmt > 0 && refundAmt < orderTotal) ? 'partial_refund' : 'full_refund';
  }
  if (body.fulfillmentStatus || body.fulfillment_status) {
    const fs = (body.fulfillmentStatus || body.fulfillment_status || '').toLowerCase();
    if (fs === 'shipped' || fs === 'pending shipment') return 'fulfillment_shipped';
    if (fs === 'delivered') return 'fulfillment_delivered';
    if (fs.includes('rma') && fs.includes('pending')) return 'rma_issued';
    if (fs === 'returned') return 'rma_received';
  }
  if (body.rmaNumber || body.rma_number) return 'rma_issued';
  if (body.cancelReason || body.cancel_reason) return 'cancel';

  // Subscription events — check billing cycle and recurring indicators
  const billingCycle = parseInt(body.billingCycleNumber || body.billing_cycle_number || body.product1_billingCycleNumber || '0');
  const responseType = (body.responseType || body.response_type || '').toUpperCase();
  const orderStatus = (body.orderStatus || body.order_status || '').toUpperCase();

  if (responseType === 'HARD_DECLINE' || responseType === 'SOFT_DECLINE' || orderStatus === 'DECLINED') {
    return billingCycle > 1 ? 'rebill_decline' : 'decline';
  }

  if (body.hasUpsells || body.has_upsells) return 'upsell';

  if (billingCycle > 1 && (responseType === 'SUCCESS' || orderStatus === 'COMPLETE')) return 'recurring_order';
  if (billingCycle === 1 && (responseType === 'SUCCESS' || orderStatus === 'COMPLETE')) return 'new_sale';

  // If we have an orderId with a successful-looking payload, default to new_sale
  if (body.orderId || body.order_id) {
    if (orderStatus === 'PARTIAL') return 'partial';
    return 'new_sale';
  }

  return 'unknown';
}

// ── Shared field extraction ─────────────────────────────────────

function extractCommonFields(body: any) {
  return {
    orderId: body.orderId || body.order_id || body.originalOrderId || body.original_order_id || null,
    customerId: body.customerId || body.customer_id || null,
    purchaseId: body.purchaseId || body.purchase_id || body.clientPurchaseId || null,
    campaignId: body.campaignId || body.campaign_id || null,
    campaignName: body.campaignName || body.campaign_name || null,
    offerName: body.offer_name || body.offerName || body.product_name || body.productName || body.product1_name || 'Unknown',
    email: (body.emailAddress || body.email_address || body.email || body.customer_email || '').toLowerCase(),
    firstName: body.firstName || body.first_name || null,
    lastName: body.lastName || body.last_name || null,
    utmCampaign: body.utm_campaign || body.utmCampaign || body.sourceValue1 || '',
    utmSource: body.utm_source || body.utmSource || body.sourceValue2 || '',
    utmMedium: body.utm_medium || body.utmMedium || body.sourceValue3 || '',
    utmContent: body.utm_content || body.utmContent || body.sourceValue4 || '',
    utmTerm: body.utm_term || body.utmTerm || body.sourceValue5 || '',
    fbclid: body.fbclid || '',
    subscriptionId: body.subscriptionId || body.subscription_id || body.purchaseId || body.purchase_id || null,
    ipAddress: body.ipAddress || body.ip_address || null,
  };
}

// ── Order status normalization ──────────────────────────────────

const ORDER_STATUS_MAP: Record<string, string> = {
  complete: 'completed', completed: 'completed', paid: 'completed', success: 'completed',
  pending: 'pending', processing: 'pending', cod_pending: 'pending',
  failed: 'failed', declined: 'failed', hard_decline: 'failed', soft_decline: 'failed',
  refunded: 'refunded', void: 'refunded', cancelled: 'refunded',
  partial: 'partial',
};

function normalizeOrderStatus(raw: string): string {
  return ORDER_STATUS_MAP[raw.toLowerCase()] || 'completed';
}

// ── Revenue extraction ──────────────────────────────────────────

function extractRevenue(body: any) {
  const total = parseFloat(body.orderTotal || body.order_total || body.totalAmount || body.total_amount || body.revenue || body.total || body.amount || body.totalPrice || body.basePrice || '0');
  const taxAmount = parseFloat(body.salesTax || body.sales_tax || body.tax || body.tax_amount || '0');
  const shipping = parseFloat(body.totalShipping || body.total_shipping || body.shippingPrice || '0');
  const subtotal = body.subtotal !== undefined
    ? parseFloat(body.subtotal)
    : body.totalPrice !== undefined
      ? parseFloat(body.totalPrice)
      : total - taxAmount;
  return { total, taxAmount, shipping, subtotal };
}

// ── Test order detection ────────────────────────────────────────

function isTestOrder(email: string, subtotal: number): boolean {
  return subtotal < 1.00 ||
    email.startsWith('test@') ||
    email.includes('+test@') ||
    email.includes('test+') ||
    email.endsWith('@example.com');
}

// ── Event log helper ────────────────────────────────────────────

async function logWebhookEvent(
  userId: number | null,
  accountId: number | null,
  eventType: string,
  body: any,
  orderId: string | null,
  customerId: string | null,
  purchaseId: string | null,
  processed: boolean,
  errorMessage?: string,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO cc_webhook_events (user_id, account_id, event_type, order_id, customer_id, purchase_id, payload, processed, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, accountId, eventType, orderId, customerId, purchaseId, JSON.stringify(body), processed, errorMessage || null],
    );
  } catch (err) {
    // Don't let logging failures break webhook processing
    console.error('[CC Webhook] Failed to log event:', err);
  }
}

// ── Event Handlers ──────────────────────────────────────────────

async function handleSaleEvent(
  body: any,
  userId: number | null,
  accountId: number | null,
  eventType: CCEventType,
) {
  const fields = extractCommonFields(body);
  const rev = extractRevenue(body);
  const rawStatus = body.order_status || body.orderStatus || body.status || body.responseType || 'completed';
  const orderStatus = eventType === 'decline' ? 'failed' : normalizeOrderStatus(rawStatus);
  const newCustomer = body.new_customer ?? body.newCustomer ?? body.isNewCustomer ?? false;
  const quantity = parseInt(body.quantity || body.product1_qty || '1', 10);
  const isCoreSku = body.is_core_sku ?? body.isCoreSku ?? true;
  const isTest = isTestOrder(fields.email, rev.subtotal);

  const offerId = userId ? await matchOffer(userId, {
    product_id: body.product_id || body.productId || body.product1_id || body.product1_crmId,
    utm_campaign: fields.utmCampaign,
    campaign_name: fields.campaignName,
  }) : null;

  const customerName = [fields.firstName, fields.lastName].filter(Boolean).join(' ') || null;
  const conversionTime = body.dateCreated || body.date_created || null;

  await pool.query(
    `INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source, utm_source, utm_medium, utm_content, utm_term, user_id, is_test, account_id, offer_id, customer_email, customer_name, conversion_time)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'checkout_champ', $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     ON CONFLICT (user_id, order_id) DO UPDATE SET
       revenue = EXCLUDED.revenue, subtotal = EXCLUDED.subtotal, tax_amount = EXCLUDED.tax_amount,
       order_status = EXCLUDED.order_status, new_customer = EXCLUDED.new_customer,
       subscription_id = EXCLUDED.subscription_id, quantity = EXCLUDED.quantity,
       utm_source = EXCLUDED.utm_source, utm_medium = EXCLUDED.utm_medium,
       utm_content = EXCLUDED.utm_content, utm_term = EXCLUDED.utm_term,
       is_test = EXCLUDED.is_test, account_id = EXCLUDED.account_id, offer_id = EXCLUDED.offer_id,
       customer_email = COALESCE(EXCLUDED.customer_email, cc_orders_today.customer_email),
       customer_name = COALESCE(EXCLUDED.customer_name, cc_orders_today.customer_name),
       conversion_time = COALESCE(EXCLUDED.conversion_time, cc_orders_today.conversion_time)`,
    [fields.orderId, fields.offerName, rev.total, rev.subtotal, rev.taxAmount, orderStatus, newCustomer, fields.utmCampaign, fields.fbclid, fields.subscriptionId, quantity, isCoreSku, fields.utmSource, fields.utmMedium, fields.utmContent, fields.utmTerm, userId, isTest, accountId, offerId, fields.email || null, customerName, conversionTime],
  );

  // Handle upsell data if embedded in the sale event
  const upsells = body.upsells || body.upsell_data;
  if (Array.isArray(upsells)) {
    for (const upsell of upsells) {
      await pool.query(
        `INSERT INTO cc_upsells_today (order_id, offered, accepted, offer_name, user_id, account_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, order_id, offer_name) DO UPDATE SET
           offered = EXCLUDED.offered, accepted = EXCLUDED.accepted`,
        [fields.orderId, upsell.offered ?? true, upsell.accepted ?? false, upsell.offer_name || fields.offerName, userId, accountId],
      );
    }
  }

  // Real-time notification for sales (not declines)
  if (orderStatus === 'completed') {
    getRealtime()?.emitNewOrder(userId, {
      orderId: fields.orderId, offerName: fields.offerName, revenue: rev.subtotal,
      status: orderStatus, newCustomer: !!newCustomer, accountId,
    });
  }
}

async function handleUpsellEvent(body: any, userId: number | null, accountId: number | null) {
  const fields = extractCommonFields(body);
  const rev = extractRevenue(body);

  // Upsell as an order
  await pool.query(
    `INSERT INTO cc_upsells_today (order_id, offered, accepted, offer_name, user_id, account_id)
     VALUES ($1, true, true, $2, $3, $4)
     ON CONFLICT (user_id, order_id, offer_name) DO UPDATE SET
       offered = true, accepted = true`,
    [fields.orderId, fields.offerName, userId, accountId],
  );

  // Also update the parent order revenue if we have a total
  if (fields.orderId && rev.total > 0) {
    getRealtime()?.emitNewOrder(userId, {
      orderId: fields.orderId, offerName: fields.offerName, revenue: rev.subtotal,
      status: 'completed', newCustomer: false, accountId,
    });
  }
}

async function handleRefundEvent(body: any, userId: number | null, _accountId: number | null, eventType: CCEventType) {
  const fields = extractCommonFields(body);

  // Update order status — growth ops needs to see refund/chargeback impact on revenue
  if (fields.orderId) {
    const newStatus = eventType === 'chargeback' ? 'refunded' : (eventType === 'partial_refund' ? 'completed' : 'refunded');
    await pool.query(
      `UPDATE cc_orders_today SET order_status = $1 WHERE order_id = $2 AND COALESCE(user_id, -1) = COALESCE($3::int, -1)`,
      [newStatus, fields.orderId, userId],
    );
  }
}

async function handleSubscriptionEvent(body: any, userId: number | null, accountId: number | null, eventType: CCEventType) {
  const fields = extractCommonFields(body);
  const amount = parseFloat(body.recurringPrice || body.recurring_price || body.totalAmount || body.total_amount || body.amount || '0');
  const billingCycle = parseInt(body.billingCycleNumber || body.billing_cycle_number || body.product1_billingCycleNumber || '0');
  const nextBillDate = body.nextBillDate || body.next_bill_date || null;
  const cancelReason = body.cancelReason || body.cancel_reason || null;

  try {
    await pool.query(
      `INSERT INTO cc_subscription_events (user_id, purchase_id, order_id, customer_id, event_type, amount, billing_cycle, next_bill_date, cancel_reason, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, fields.purchaseId || fields.subscriptionId, fields.orderId, fields.customerId, eventType, amount || null, billingCycle || null, nextBillDate, cancelReason, JSON.stringify(body)],
    );
  } catch (err) {
    console.error('[CC Webhook] Failed to insert subscription event:', err);
  }

  // For recurring_order events, also create an order record
  if (eventType === 'recurring_order') {
    await handleSaleEvent(body, userId, accountId, eventType);
  }

  // For cancel events, update the purchase status
  if (eventType === 'cancel' && fields.purchaseId) {
    await pool.query(
      `UPDATE cc_purchases SET raw_data = raw_data || '{"cancelledViaWebhook": true}'::jsonb, synced_at = NOW()
       WHERE purchase_id = $1 AND COALESCE(user_id, -1) = COALESCE($2::int, -1)`,
      [fields.purchaseId, userId],
    );
  }
}

// ── Main CC Webhook Handler ─────────────────────────────────────

async function handleCCWebhook(req: Request, res: Response) {
  const body = req.body;
  const tokenResult = await resolveWebhookToken(req.params.webhookToken);
  const userId = tokenResult?.userId ?? null;
  const accountId = tokenResult?.accountId ?? null;

  const eventType = detectEventType(body);
  const fields = extractCommonFields(body);

  try {
    // Route to appropriate handler based on event type
    switch (eventType) {
      // ── Sale / Order events ───────────────────────
      case 'new_sale':
      case 'decline':
      case 'capture':
      case 'partial':
      case 'lead':
      case 'cod_pending':
        await handleSaleEvent(body, userId, accountId, eventType);
        break;

      // ── Upsell ────────────────────────────────────
      case 'upsell':
        await handleUpsellEvent(body, userId, accountId);
        break;

      // ── Refund / Chargeback ───────────────────────
      case 'full_refund':
      case 'partial_refund':
      case 'chargeback':
        await handleRefundEvent(body, userId, accountId, eventType);
        break;

      // ── Subscription lifecycle ────────────────────
      case 'subscription_started':
      case 'recurring_order':
      case 'rebill_decline':
      case 'pre_billing':
      case 'recycle_failed':
      case 'cancel':
      case 'pause':
      case 'reactivate':
        await handleSubscriptionEvent(body, userId, accountId, eventType);
        break;

      // ── Non-growth events — log only ───────────────
      case 'fulfillment_shipped':
      case 'fulfillment_delivered':
      case 'rma_issued':
      case 'rma_received':
      case 'customer_update':
        // Logged to cc_webhook_events but no special handling needed for growth ops
        break;

      // ── Unknown — still log it ────────────────────
      case 'unknown':
      default:
        console.warn(`[CC Webhook] Unknown event type, payload keys: ${Object.keys(body).join(', ')}`);
        break;
    }

    // Log every event for audit trail
    await logWebhookEvent(userId, accountId, eventType, body, fields.orderId, fields.customerId, fields.purchaseId, true);

    res.json({ success: true, event_type: eventType, order_id: fields.orderId });
  } catch (err: any) {
    console.error(`[CC Webhook] Error processing ${eventType}:`, err);
    await logWebhookEvent(userId, accountId, eventType, body, fields.orderId, fields.customerId, fields.purchaseId, false, err.message);
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
