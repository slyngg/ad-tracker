import pool from '../db';
import https from 'https';
import { getSetting } from './settings';
import { decrypt } from './oauth-providers';

// ── Auth resolution (mirrors facebook-sync.ts pattern) ─────────

async function getShopifyAuth(userId?: number): Promise<{ accessToken: string; storeUrl: string } | null> {
  if (userId) {
    try {
      const result = await pool.query(
        `SELECT credentials, config FROM integration_configs
         WHERE user_id = $1 AND platform = 'shopify' AND status = 'connected'`,
        [userId]
      );
      if (result.rows.length > 0) {
        const { credentials, config } = result.rows[0];
        if (credentials?.access_token_encrypted && config?.store_url) {
          return {
            accessToken: decrypt(credentials.access_token_encrypted),
            storeUrl: config.store_url.replace(/\/$/, ''),
          };
        }
      }
    } catch {
      // Fall through to getSetting
    }
  }

  // Fallback to app_settings
  const accessToken = await getSetting('shopify_access_token', userId);
  const storeUrl = await getSetting('shopify_store_url', userId);
  if (accessToken && storeUrl) {
    return { accessToken, storeUrl: storeUrl.replace(/\/$/, '') };
  }

  return null;
}

// ── HTTP helper ────────────────────────────────────────────────

function fetchShopifyJSON(url: string, accessToken: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      const linkHeader = res.headers['link'] as string | undefined;
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // Extract next page URL from Link header
          let nextUrl: string | null = null;
          if (linkHeader) {
            const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            if (nextMatch) nextUrl = nextMatch[1];
          }
          resolve({ body: parsed, nextUrl });
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

// ── Products ───────────────────────────────────────────────────

export async function syncShopifyProducts(userId?: number): Promise<{ synced: number; skipped: boolean }> {
  const auth = await getShopifyAuth(userId);
  if (!auth) return { synced: 0, skipped: true };

  const { accessToken, storeUrl } = auth;
  let synced = 0;
  let url: string | null = `https://${storeUrl.replace(/^https?:\/\//, '')}/admin/api/2024-01/products.json?limit=250`;

  try {
    while (url) {
      const { body, nextUrl } = await fetchShopifyJSON(url, accessToken);
      const products = body.products || [];

      for (const p of products) {
        try {
          const productId = String(p.id);
          const variants = p.variants || [];
          const totalInventory = variants.reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0);
          const imageUrl = p.image?.src || p.images?.[0]?.src || null;

          await pool.query(
            `INSERT INTO shopify_products (user_id, shopify_product_id, title, vendor, product_type, handle, status, tags, variants, total_inventory, image_url, raw_data, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
             ON CONFLICT (user_id, shopify_product_id) DO UPDATE SET
               title = EXCLUDED.title, vendor = EXCLUDED.vendor, product_type = EXCLUDED.product_type,
               handle = EXCLUDED.handle, status = EXCLUDED.status, tags = EXCLUDED.tags,
               variants = EXCLUDED.variants, total_inventory = EXCLUDED.total_inventory,
               image_url = EXCLUDED.image_url, raw_data = EXCLUDED.raw_data, synced_at = NOW()`,
            [
              userId || null,
              productId,
              p.title || null,
              p.vendor || null,
              p.product_type || null,
              p.handle || null,
              p.status || 'active',
              p.tags || null,
              JSON.stringify(variants),
              totalInventory,
              imageUrl,
              JSON.stringify(p),
            ]
          );
          synced++;
        } catch (err) {
          console.error(`[Shopify Sync] Failed to upsert product ${p.id}:`, err);
        }
      }

      url = nextUrl;
    }

    console.log(`[Shopify Sync] Products: synced ${synced}${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    console.error(`[Shopify Sync] Products fetch failed:`, err);
  }

  return { synced, skipped: false };
}

// ── Customers ──────────────────────────────────────────────────

export async function syncShopifyCustomers(userId?: number): Promise<{ synced: number; skipped: boolean }> {
  const auth = await getShopifyAuth(userId);
  if (!auth) return { synced: 0, skipped: true };

  const { accessToken, storeUrl } = auth;
  let synced = 0;
  let url: string | null = `https://${storeUrl.replace(/^https?:\/\//, '')}/admin/api/2024-01/customers.json?limit=250`;

  try {
    while (url) {
      const { body, nextUrl } = await fetchShopifyJSON(url, accessToken);
      const customers = body.customers || [];

      for (const c of customers) {
        try {
          const customerId = String(c.id);
          const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || null;
          const defaultAddr = c.default_address || {};

          await pool.query(
            `INSERT INTO shopify_customers (user_id, shopify_customer_id, email, name, phone, orders_count, total_spent, city, province, country, tags, accepts_marketing, raw_data, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
             ON CONFLICT (user_id, shopify_customer_id) DO UPDATE SET
               email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone,
               orders_count = EXCLUDED.orders_count, total_spent = EXCLUDED.total_spent,
               city = EXCLUDED.city, province = EXCLUDED.province, country = EXCLUDED.country,
               tags = EXCLUDED.tags, accepts_marketing = EXCLUDED.accepts_marketing,
               raw_data = EXCLUDED.raw_data, synced_at = NOW()`,
            [
              userId || null,
              customerId,
              c.email || null,
              name,
              c.phone || null,
              c.orders_count || 0,
              parseFloat(c.total_spent || '0') || 0,
              defaultAddr.city || null,
              defaultAddr.province || null,
              defaultAddr.country || null,
              c.tags || null,
              c.accepts_marketing || false,
              JSON.stringify(c),
            ]
          );
          synced++;
        } catch (err) {
          console.error(`[Shopify Sync] Failed to upsert customer ${c.id}:`, err);
        }
      }

      url = nextUrl;
    }

    console.log(`[Shopify Sync] Customers: synced ${synced}${userId ? ` for user ${userId}` : ''}`);
  } catch (err) {
    console.error(`[Shopify Sync] Customers fetch failed:`, err);
  }

  return { synced, skipped: false };
}
