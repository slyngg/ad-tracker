import pool from '../db';

const CAMPAIGNS = ['TOF - Broad - US', 'TOF - Lookalike 1% - US', 'MOF - Retarget Engagers', 'BOF - Cart Abandoners', 'TOF - Interest Stack - Women 25-44'];
const AD_SETS: Record<string, string[]> = {
  'TOF - Broad - US': ['Broad 18-65+', 'Broad 25-54', 'Broad Advantage+'],
  'TOF - Lookalike 1% - US': ['LLA Purchase 1%', 'LLA ATC 1%', 'LLA Visitor 1%'],
  'MOF - Retarget Engagers': ['IG Engagers 7d', 'FB Video 50% 14d', 'Site Visitors 14d'],
  'BOF - Cart Abandoners': ['ATC 3d', 'Checkout Init 3d', 'IC 7d'],
  'TOF - Interest Stack - Women 25-44': ['Skincare + Beauty', 'Health + Wellness', 'Fitness + Yoga'],
};
const PRODUCTS = ['Radiance Serum Bundle', 'GlowMax Moisturizer', 'VitaBoost Supplement 90ct', 'Hydra Repair Night Cream', 'CollagenPro Powder', 'ClearSkin Acne Kit', 'AgeLess Eye Cream', 'Daily Defense SPF50'];
const ACCOUNT = 'Main Ad Account';

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export async function seedDemoData(userId: number): Promise<{ adRows: number; orders: number; archiveDays: number }> {
  let adRows = 0, orders = 0, archiveDays = 0;

  // Seed fb_ads_today
  for (const campaign of CAMPAIGNS) {
    for (const adSet of (AD_SETS[campaign] || ['Default'])) {
      const spend = rand(20, 300);
      const impressions = randInt(800, 15000);
      const clicks = Math.floor(impressions * rand(0.008, 0.04));
      const lpViews = Math.floor(clicks * rand(0.6, 0.9));
      await pool.query(
        `INSERT INTO fb_ads_today (account_name, campaign_name, ad_set_name, ad_set_id, ad_name, spend, clicks, impressions, landing_page_views, synced_at, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
         ON CONFLICT (user_id, ad_set_id, ad_name) DO UPDATE SET spend = EXCLUDED.spend, clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, landing_page_views = EXCLUDED.landing_page_views, synced_at = NOW()`,
        [ACCOUNT, campaign, adSet, `demo_${adSet.replace(/\s+/g, '_').toLowerCase()}_${userId}`, `${adSet} - Creative ${randInt(1, 5)}`, spend.toFixed(2), clicks, impressions, lpViews, userId]
      );
      adRows++;
    }
  }

  // Seed cc_orders_today
  for (let i = 0; i < 50; i++) {
    const revenue = rand(29.99, 149.99);
    const tax = revenue * 0.08;
    await pool.query(
      `INSERT INTO cc_orders_today (order_id, offer_name, revenue, subtotal, tax_amount, order_status, new_customer, utm_campaign, fbclid, subscription_id, quantity, is_core_sku, source, utm_source, utm_medium, user_id)
       VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9, $10, true, $11, $12, $13, $14)
       ON CONFLICT (user_id, order_id) DO NOTHING`,
      [`DEMO-${Date.now()}-${randInt(1000, 9999)}-${i}`, pick(PRODUCTS), revenue.toFixed(2), (revenue - tax).toFixed(2), tax.toFixed(2), Math.random() > 0.4,
       pick(Object.values(AD_SETS).flat()), Math.random() > 0.3 ? `fb.1.${Date.now()}.${randInt(100000, 999999)}` : '',
       Math.random() > 0.7 ? `sub_${randInt(1000, 9999)}` : null, randInt(1, 3),
       pick(['checkout_champ', 'shopify']), pick(['facebook', 'google', 'tiktok']), pick(['cpc', 'cpm', 'organic']), userId]
    );
    orders++;
  }

  // Seed 30 days of archive data
  for (let d = 1; d <= 30; d++) {
    const dateStr = new Date(Date.now() - d * 86400000).toISOString().split('T')[0];
    const dailySpend = rand(500, 2500);
    const dailyRevenue = dailySpend * rand(1.2, 3.5);
    const dailyOrders = randInt(15, 80);
    const dailyImpressions = randInt(10000, 80000);
    const dailyClicks = Math.floor(dailyImpressions * rand(0.01, 0.035));
    try {
      await pool.query(
        `INSERT INTO fb_ads_archive (archive_date, account_name, campaign_name, ad_set_name, spend, clicks, impressions, landing_page_views, user_id)
         VALUES ($1, $2, 'All Campaigns', 'All Ad Sets', $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [dateStr, ACCOUNT, dailySpend.toFixed(2), dailyClicks, dailyImpressions, Math.floor(dailyClicks * 0.75), userId]
      );
      await pool.query(
        `INSERT INTO orders_archive (archive_date, offer_name, total_revenue, total_subtotal, total_tax, order_count, new_customers, refunded_count, subscription_count, user_id)
         VALUES ($1, 'All Products', $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
        [dateStr, dailyRevenue.toFixed(2), (dailyRevenue * 0.92).toFixed(2), (dailyRevenue * 0.08).toFixed(2), dailyOrders, Math.floor(dailyOrders * 0.6), randInt(0, 3), randInt(0, Math.floor(dailyOrders * 0.15)), userId]
      );
      archiveDays++;
    } catch {}
  }

  await pool.query('UPDATE users SET demo_mode = true WHERE id = $1', [userId]);
  return { adRows, orders, archiveDays };
}

export async function clearDemoData(userId: number): Promise<void> {
  await pool.query(`DELETE FROM fb_ads_today WHERE user_id = $1 AND ad_set_id LIKE 'demo_%'`, [userId]);
  await pool.query(`DELETE FROM cc_orders_today WHERE user_id = $1 AND order_id LIKE 'DEMO-%'`, [userId]);
  await pool.query(`DELETE FROM fb_ads_archive WHERE user_id = $1 AND campaign_name = 'All Campaigns' AND ad_set_name = 'All Ad Sets'`, [userId]);
  await pool.query(`DELETE FROM orders_archive WHERE user_id = $1 AND offer_name = 'All Products'`, [userId]);
  await pool.query('UPDATE users SET demo_mode = false WHERE id = $1', [userId]);
}
