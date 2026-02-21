import pool from '../db';
import { getSetting } from './settings';
import { initGA4Client, getGA4Sessions, getGA4PageData, getGA4SearchQueries, getGA4FunnelEvents, getGA4ProductData } from './ga4-client';

export async function syncGA4Data(userId?: number): Promise<{ synced: number; error?: string }> {
  const credentialsJson = await getSetting('ga4_credentials_json', userId);
  const propertyId = await getSetting('ga4_property_id', userId);

  if (!credentialsJson || !propertyId) {
    console.warn('[GA4 Sync] Credentials or property ID not set, skipping');
    return { synced: 0, error: 'GA4 not configured' };
  }

  const ga4 = await initGA4Client(credentialsJson, propertyId);
  if (!ga4) return { synced: 0, error: 'Failed to initialize GA4 client' };

  const startDate = '30daysAgo';
  const endDate = 'today';
  let totalSynced = 0;

  const dbClient = await pool.connect();

  try {
    await dbClient.query('BEGIN');

    // Sync sessions
    const sessions = await getGA4Sessions(ga4, startDate, endDate);
    for (const row of sessions) {
      try {
        await dbClient.query('SAVEPOINT row_insert');
        await dbClient.query(`
          INSERT INTO ga4_sessions (user_id, date, source, medium, campaign, device_category, country, city, landing_page,
            sessions, users_count, new_users, pageviews, pages_per_session, avg_session_duration, bounce_rate,
            conversions, conversion_rate, revenue, add_to_carts, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
          ON CONFLICT (user_id, date, source, medium, device_category, country, landing_page) DO UPDATE SET
            sessions = EXCLUDED.sessions, users_count = EXCLUDED.users_count, new_users = EXCLUDED.new_users,
            pageviews = EXCLUDED.pageviews, pages_per_session = EXCLUDED.pages_per_session,
            avg_session_duration = EXCLUDED.avg_session_duration, bounce_rate = EXCLUDED.bounce_rate,
            conversions = EXCLUDED.conversions, conversion_rate = EXCLUDED.conversion_rate,
            revenue = EXCLUDED.revenue, add_to_carts = EXCLUDED.add_to_carts, synced_at = NOW()
        `, [
          userId || null, row.dimensions.date, row.dimensions.sessionSource, row.dimensions.sessionMedium,
          row.dimensions.sessionCampaignName, row.dimensions.deviceCategory, row.dimensions.country,
          row.dimensions.city, row.dimensions.landingPage,
          row.metrics.sessions, row.metrics.totalUsers, row.metrics.newUsers, row.metrics.screenPageViews,
          row.metrics.screenPageViewsPerSession, row.metrics.averageSessionDuration, row.metrics.bounceRate,
          row.metrics.conversions, row.metrics.sessionConversionRate, row.metrics['ecommerce:totalRevenue'] || 0,
          row.metrics.addToCarts,
        ]);
        await dbClient.query('RELEASE SAVEPOINT row_insert');
        totalSynced++;
      } catch (rowErr: any) {
        await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
        console.error('[GA4 Sync] Failed to insert session row:', rowErr.message);
      }
    }

    // Sync pages
    const pages = await getGA4PageData(ga4, startDate, endDate);
    for (const row of pages) {
      try {
        await dbClient.query('SAVEPOINT row_insert');
        await dbClient.query(`
          INSERT INTO ga4_pages (user_id, date, page_path, page_title, sessions, pageviews, avg_time_on_page,
            conversions, conversion_rate, revenue, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (user_id, date, page_path) DO UPDATE SET
            page_title = EXCLUDED.page_title, sessions = EXCLUDED.sessions, pageviews = EXCLUDED.pageviews,
            avg_time_on_page = EXCLUDED.avg_time_on_page, conversions = EXCLUDED.conversions,
            conversion_rate = EXCLUDED.conversion_rate, revenue = EXCLUDED.revenue, synced_at = NOW()
        `, [
          userId || null, row.dimensions.date, row.dimensions.pagePath, row.dimensions.pageTitle,
          row.metrics.sessions, row.metrics.screenPageViews, row.metrics.averageSessionDuration,
          row.metrics.conversions, row.metrics.sessionConversionRate, row.metrics['ecommerce:totalRevenue'] || 0,
        ]);
        await dbClient.query('RELEASE SAVEPOINT row_insert');
        totalSynced++;
      } catch (rowErr: any) {
        await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
        console.error('[GA4 Sync] Failed to insert page row:', rowErr.message);
      }
    }

    // Sync search queries
    const searches = await getGA4SearchQueries(ga4, startDate, endDate);
    for (const row of searches) {
      try {
        await dbClient.query('SAVEPOINT row_insert');
        await dbClient.query(`
          INSERT INTO ga4_search_queries (user_id, date, search_term, search_count, conversions_after_search, revenue_after_search, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (user_id, date, search_term) DO UPDATE SET
            search_count = EXCLUDED.search_count, conversions_after_search = EXCLUDED.conversions_after_search,
            revenue_after_search = EXCLUDED.revenue_after_search, synced_at = NOW()
        `, [
          userId || null, row.dimensions.date, row.dimensions.searchTerm,
          row.metrics.sessions, row.metrics.conversions, row.metrics['ecommerce:totalRevenue'] || 0,
        ]);
        await dbClient.query('RELEASE SAVEPOINT row_insert');
        totalSynced++;
      } catch (rowErr: any) {
        await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
        console.error('[GA4 Sync] Failed to insert search query row:', rowErr.message);
      }
    }

    // Sync funnel events
    const funnelEvents = await getGA4FunnelEvents(ga4, startDate, endDate);
    for (const row of funnelEvents) {
      try {
        await dbClient.query('SAVEPOINT row_insert');
        await dbClient.query(`
          INSERT INTO ga4_funnel_events (user_id, date, event_name, event_count, unique_users, device_category, source, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          ON CONFLICT (user_id, date, event_name, device_category, source) DO UPDATE SET
            event_count = EXCLUDED.event_count, unique_users = EXCLUDED.unique_users, synced_at = NOW()
        `, [
          userId || null, row.dimensions.date, row.dimensions.eventName,
          row.metrics.eventCount, row.metrics.totalUsers, row.dimensions.deviceCategory, row.dimensions.sessionSource,
        ]);
        await dbClient.query('RELEASE SAVEPOINT row_insert');
        totalSynced++;
      } catch (rowErr: any) {
        await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
        console.error('[GA4 Sync] Failed to insert funnel event row:', rowErr.message);
      }
    }

    // Sync products
    const products = await getGA4ProductData(ga4, startDate, endDate);
    for (const row of products) {
      try {
        await dbClient.query('SAVEPOINT row_insert');
        await dbClient.query(`
          INSERT INTO ga4_products (user_id, date, product_name, product_id, product_category,
            views, add_to_carts, purchases, revenue, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (user_id, date, product_id) DO UPDATE SET
            product_name = EXCLUDED.product_name, product_category = EXCLUDED.product_category,
            views = EXCLUDED.views, add_to_carts = EXCLUDED.add_to_carts, purchases = EXCLUDED.purchases,
            revenue = EXCLUDED.revenue, synced_at = NOW()
        `, [
          userId || null, row.dimensions.date, row.dimensions.itemName, row.dimensions.itemId,
          row.dimensions.itemCategory, row.metrics.itemsViewed, row.metrics.itemsAddedToCart,
          row.metrics.itemsPurchased, row.metrics.itemRevenue,
        ]);
        await dbClient.query('RELEASE SAVEPOINT row_insert');
        totalSynced++;
      } catch (rowErr: any) {
        await dbClient.query('ROLLBACK TO SAVEPOINT row_insert');
        console.error('[GA4 Sync] Failed to insert product row:', rowErr.message);
      }
    }

    await dbClient.query('COMMIT');
    console.log(`[GA4 Sync] Synced ${totalSynced} rows`);
    return { synced: totalSynced };
  } catch (err: any) {
    await dbClient.query('ROLLBACK');
    console.error('[GA4 Sync] Error:', err);
    return { synced: totalSynced, error: err.message };
  } finally {
    dbClient.release();
  }
}
