import { Router, Request, Response } from 'express';
import pool from '../db';
import { verifyCheckoutChamp, verifyShopify } from '../middleware/webhook-verify';

const router = Router();

// POST /api/webhooks/checkout-champ
router.post('/checkout-champ', verifyCheckoutChamp, async (req: Request, res: Response) => {
  try {
    const body = req.body;

    const orderId = body.order_id || body.orderId;
    const offerName = body.offer_name || body.offerName || body.product_name;
    const newCustomer = body.new_customer ?? body.newCustomer ?? false;
    const utmCampaign = body.utm_campaign || body.utmCampaign || '';
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

    await pool.query(
      `INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'checkout_champ')
       ON CONFLICT (order_id) DO UPDATE SET
         revenue = EXCLUDED.revenue,
         subtotal = EXCLUDED.subtotal,
         tax_amount = EXCLUDED.tax_amount,
         order_status = EXCLUDED.order_status,
         new_customer = EXCLUDED.new_customer,
         subscription_id = EXCLUDED.subscription_id,
         quantity = EXCLUDED.quantity`,
      [orderId, offerName, total, subtotal, taxAmount, orderStatus, newCustomer, utmCampaign, fbclid, subscriptionId, quantity, isCoreSku]
    );

    // Handle upsell data if present
    const upsells = body.upsells || body.upsell_data;
    if (Array.isArray(upsells)) {
      for (const upsell of upsells) {
        await pool.query(
          `INSERT INTO cc_upsells_today (order_id, offered, accepted, offer_name)
           VALUES ($1, $2, $3, $4)`,
          [orderId, upsell.offered ?? true, upsell.accepted ?? false, upsell.offer_name || offerName]
        );
      }
    }

    res.json({ success: true, order_id: orderId });
  } catch (err) {
    console.error('Error processing CC webhook:', err);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/shopify
router.post('/shopify', verifyShopify, async (req: Request, res: Response) => {
  try {
    const body = req.body;

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
    let fbclid = '';
    const landingSite = body.landing_site || '';
    if (landingSite) {
      try {
        const url = new URL(landingSite.startsWith('http') ? landingSite : `https://example.com${landingSite}`);
        utmCampaign = url.searchParams.get('utm_campaign') || '';
        fbclid = url.searchParams.get('fbclid') || '';
      } catch {
        // Ignore parse errors
      }
    }

    const quantity = lineItems.reduce((sum: number, item: { quantity?: number }) => sum + (item.quantity || 1), 0);

    await pool.query(
      `INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, true, 'shopify')
       ON CONFLICT (order_id) DO UPDATE SET
         revenue = EXCLUDED.revenue,
         subtotal = EXCLUDED.subtotal,
         tax_amount = EXCLUDED.tax_amount,
         order_status = EXCLUDED.order_status,
         new_customer = EXCLUDED.new_customer,
         quantity = EXCLUDED.quantity`,
      [orderId, offerName, totalPrice, subtotalPrice, totalTax, orderStatus, newCustomer, utmCampaign, fbclid, quantity]
    );

    res.json({ success: true, order_id: orderId });
  } catch (err) {
    console.error('Error processing Shopify webhook:', err);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
