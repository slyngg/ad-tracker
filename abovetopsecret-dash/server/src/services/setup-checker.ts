import pool from '../db';
import { getSetting } from './settings';

export interface ComponentStatus {
  component: string;
  status: 'not_configured' | 'configured' | 'connected' | 'error';
  lastCheckedAt: string | null;
  errorMessage: string | null;
  metadata: Record<string, any>;
}

export async function checkWebhookStatus(userId: number | null): Promise<{ shopify: ComponentStatus; checkoutChamp: ComponentStatus }> {
  const shopifyStatus: ComponentStatus = { component: 'shopify_webhook', status: 'not_configured', lastCheckedAt: new Date().toISOString(), errorMessage: null, metadata: {} };
  const ccStatus: ComponentStatus = { component: 'cc_webhook', status: 'not_configured', lastCheckedAt: new Date().toISOString(), errorMessage: null, metadata: {} };

  try {
    const shopifyResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM cc_orders_today WHERE source = 'shopify' AND ($1::int IS NULL OR user_id = $1)`, [userId]
    );
    if (parseInt(shopifyResult.rows[0].cnt, 10) > 0) {
      shopifyStatus.status = 'connected';
      shopifyStatus.metadata = { orderCount: parseInt(shopifyResult.rows[0].cnt, 10) };
    }

    const ccResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM cc_orders_today WHERE source = 'checkout_champ' AND ($1::int IS NULL OR user_id = $1)`, [userId]
    );
    if (parseInt(ccResult.rows[0].cnt, 10) > 0) {
      ccStatus.status = 'connected';
      ccStatus.metadata = { orderCount: parseInt(ccResult.rows[0].cnt, 10) };
    }
  } catch {}

  return { shopify: shopifyStatus, checkoutChamp: ccStatus };
}

export async function checkFacebookStatus(userId: number | null): Promise<ComponentStatus> {
  const status: ComponentStatus = { component: 'facebook_ads', status: 'not_configured', lastCheckedAt: new Date().toISOString(), errorMessage: null, metadata: {} };

  try {
    const accessToken = await getSetting('fb_access_token', userId);
    if (!accessToken) return status;

    status.status = 'configured';
    status.metadata.hasToken = true;

    const fbResult = await pool.query(`SELECT COUNT(*) as cnt FROM fb_ads_today WHERE ($1::int IS NULL OR user_id = $1)`, [userId]);
    if (parseInt(fbResult.rows[0].cnt, 10) > 0) {
      status.status = 'connected';
      status.metadata.adRowCount = parseInt(fbResult.rows[0].cnt, 10);
    }
  } catch {
    status.status = 'error';
    status.errorMessage = 'Failed to check Facebook status';
  }

  return status;
}

export async function checkCostStatus(userId: number | null): Promise<ComponentStatus> {
  const status: ComponentStatus = { component: 'costs', status: 'not_configured', lastCheckedAt: new Date().toISOString(), errorMessage: null, metadata: {} };
  try {
    const result = await pool.query(`SELECT COUNT(*) as cnt FROM cost_settings WHERE ($1::int IS NULL OR user_id = $1)`, [userId]);
    if (parseInt(result.rows[0].cnt, 10) > 0) {
      status.status = 'configured';
      status.metadata = { costEntries: parseInt(result.rows[0].cnt, 10) };
    }
  } catch {}
  return status;
}

export async function checkTrackingStatus(userId: number | null): Promise<ComponentStatus> {
  const status: ComponentStatus = { component: 'tracking', status: 'not_configured', lastCheckedAt: new Date().toISOString(), errorMessage: null, metadata: {} };
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as cnt FROM cc_orders_today WHERE utm_campaign IS NOT NULL AND utm_campaign != '' AND ($1::int IS NULL OR user_id = $1)`, [userId]
    );
    if (parseInt(result.rows[0].cnt, 10) > 0) {
      status.status = 'connected';
      status.metadata = { ordersWithUtm: parseInt(result.rows[0].cnt, 10) };
    }
  } catch {}
  return status;
}

export async function checkAllSetupStatus(userId: number | null): Promise<ComponentStatus[]> {
  const [webhooks, facebook, costs, tracking] = await Promise.all([
    checkWebhookStatus(userId),
    checkFacebookStatus(userId),
    checkCostStatus(userId),
    checkTrackingStatus(userId),
  ]);

  const statuses = [webhooks.shopify, webhooks.checkoutChamp, facebook, costs, tracking];

  if (userId) {
    for (const s of statuses) {
      try {
        await pool.query(
          `INSERT INTO setup_status (user_id, component, status, last_checked_at, error_message, metadata, updated_at)
           VALUES ($1, $2, $3, NOW(), $4, $5, NOW())
           ON CONFLICT (user_id, component) DO UPDATE SET status = EXCLUDED.status, last_checked_at = NOW(), error_message = EXCLUDED.error_message, metadata = EXCLUDED.metadata, updated_at = NOW()`,
          [userId, s.component, s.status, s.errorMessage, JSON.stringify(s.metadata)]
        );
      } catch {}
    }
  }

  return statuses;
}
