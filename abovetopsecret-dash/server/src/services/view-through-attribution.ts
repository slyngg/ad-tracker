/**
 * Modeled View-Through Attribution Engine
 *
 * Probabilistic model that estimates view-through conversions from ad platforms.
 * We don't know for sure if someone saw an ad — we estimate the probability
 * based on impression data, reach, frequency, and time decay.
 *
 * Key design decisions:
 * - Conservative cap: view-through credit capped at 30% of order revenue
 * - Click priority: if a visitor clicked an ad on a platform, no view credit for that platform
 * - Probabilistic: uses frequency, reach, time decay, and platform base rates
 * - Additive: view-through and click-through attribution are combined (not replacing)
 */

import pool from '../db';
import { createLogger } from '../lib/logger';
import type { AttributionModel } from './pixel-attribution';

const log = createLogger('ViewThroughAttribution');

// ── Constants ───────────────────────────────────────────────────

/** Maximum share of order revenue that can be attributed to view-through */
const MAX_VIEW_CREDIT_SHARE = 0.30;

/** Maximum probability for a single view-through attribution */
const MAX_VIEW_PROBABILITY = 0.30;

/** Time decay half-life in days for view-through */
const VT_DECAY_HALF_LIFE_DAYS = 14;

/** Historical platform view-through conversion base rates */
const PLATFORM_BASE_RATES: Record<string, number> = {
  meta: 0.15,
  tiktok: 0.10,
  google: 0.08,
  newsbreak: 0.05,
};
const DEFAULT_BASE_RATE = 0.05;

// ── Types ───────────────────────────────────────────────────────

interface ConvertedOrder {
  order_id: string;
  visitor_id: number;
  revenue: number;
  converted_at: Date;
}

interface ImpressionRow {
  platform: string;
  campaign_id: string | null;
  total_impressions: number;
  total_reach: number;
  avg_frequency: number;
  impression_date: Date;
}

interface ViewThroughResult {
  visitor_id: number;
  order_id: string;
  platform: string;
  campaign_id: string | null;
  revenue: number;
  view_probability: number;
  attributed_revenue: number;
}

export interface PlatformViewReport {
  platform: string;
  impressions: number;
  view_conversions: number;
  view_revenue: number;
  avg_probability: number;
}

export interface ViewThroughReport {
  platforms: PlatformViewReport[];
  total_view_revenue: number;
  total_click_revenue: number;
  combined_revenue: number;
  view_share: string;
}

export interface CombinedPlatformRow {
  platform: string;
  click_conversions: number;
  click_revenue: number;
  view_conversions: number;
  view_revenue: number;
  total_conversions: number;
  total_revenue: number;
}

export interface CombinedReport {
  platforms: CombinedPlatformRow[];
  totals: {
    click_conversions: number;
    click_revenue: number;
    view_conversions: number;
    view_revenue: number;
    total_conversions: number;
    total_revenue: number;
  };
}

// ── Core computation ────────────────────────────────────────────

/**
 * Compute view-through attribution for a single user over a date range.
 *
 * For each Purchase event:
 * 1. Get which platforms the visitor clicked on (from touchpoints)
 * 2. Get which platforms had impressions but no clicks from this visitor
 * 3. Calculate view probability for each non-clicked platform
 * 4. Cap total VT credit at 30% of order revenue
 * 5. Store results in view_through_results
 */
export async function computeViewThrough(
  userId: number,
  startDate: string,
  endDate: string,
): Promise<{ orders: number; results: number }> {
  log.info({ userId, startDate, endDate }, 'Starting view-through attribution computation');

  // Step 1: Get all Purchase events in the date range
  const ordersResult = await pool.query<ConvertedOrder>(
    `SELECT DISTINCT ON (e.order_id)
       e.order_id,
       e.visitor_id,
       COALESCE(e.revenue, 0) AS revenue,
       e.created_at AS converted_at
     FROM pixel_events_v2 e
     WHERE e.user_id = $1
       AND e.event_name = 'Purchase'
       AND e.order_id IS NOT NULL
       AND e.visitor_id IS NOT NULL
       AND e.created_at >= $2::date
       AND e.created_at < ($3::date + INTERVAL '1 day')
     ORDER BY e.order_id, e.created_at ASC`,
    [userId, startDate, endDate],
  );

  const orders = ordersResult.rows;
  if (orders.length === 0) {
    log.info({ userId }, 'No converted orders found for view-through computation');
    return { orders: 0, results: 0 };
  }

  log.info({ userId, orderCount: orders.length }, 'Found orders for view-through computation');

  // Step 2: Get all platforms that had impressions in the window
  // We look back up to 30 days before the date range start for impression influence
  const impressionsResult = await pool.query<ImpressionRow>(
    `SELECT
       platform,
       campaign_id,
       SUM(impressions) AS total_impressions,
       GREATEST(MAX(reach), 1) AS total_reach,
       CASE WHEN GREATEST(MAX(reach), 1) > 0
            THEN SUM(impressions)::numeric / GREATEST(MAX(reach), 1)
            ELSE 0 END AS avg_frequency,
       date AS impression_date
     FROM pixel_impressions
     WHERE user_id = $1
       AND date >= ($2::date - INTERVAL '30 days')
       AND date <= $3::date
     GROUP BY platform, campaign_id, date
     ORDER BY platform, date`,
    [userId, startDate, endDate],
  );

  // Build a map: platform -> array of impression data by date
  const impressionsByPlatform = new Map<string, ImpressionRow[]>();
  for (const row of impressionsResult.rows) {
    const list = impressionsByPlatform.get(row.platform) || [];
    list.push(row);
    impressionsByPlatform.set(row.platform, list);
  }

  if (impressionsByPlatform.size === 0) {
    log.info({ userId }, 'No impression data found — skipping view-through computation');
    return { orders: orders.length, results: 0 };
  }

  // Get max reach across all platforms (for normalization)
  const maxReachResult = await pool.query<{ max_reach: number }>(
    `SELECT COALESCE(MAX(reach), 1) AS max_reach
     FROM pixel_impressions
     WHERE user_id = $1
       AND date >= ($2::date - INTERVAL '30 days')
       AND date <= $3::date`,
    [userId, startDate, endDate],
  );
  const globalMaxReach = Math.max(maxReachResult.rows[0]?.max_reach || 1, 1);

  // Step 3: For each order, compute VT probabilities
  const allResults: ViewThroughResult[] = [];

  // Batch-fetch clicked platforms for all visitors
  const visitorIds = [...new Set(orders.map((o) => o.visitor_id))];

  const clickedPlatformsResult = await pool.query<{
    visitor_id: number;
    platform: string;
  }>(
    `SELECT DISTINCT visitor_id, platform
     FROM pixel_touchpoints
     WHERE user_id = $1
       AND visitor_id = ANY($2)`,
    [userId, visitorIds],
  );

  // Build map: visitor_id -> Set of clicked platforms
  const clickedPlatformsByVisitor = new Map<number, Set<string>>();
  for (const row of clickedPlatformsResult.rows) {
    const set = clickedPlatformsByVisitor.get(row.visitor_id) || new Set();
    set.add(row.platform);
    clickedPlatformsByVisitor.set(row.visitor_id, set);
  }

  for (const order of orders) {
    if (order.revenue <= 0) continue;

    const clickedPlatforms = clickedPlatformsByVisitor.get(order.visitor_id) || new Set();

    // For each platform that had impressions but the visitor didn't click on
    let totalViewRevenue = 0;
    const maxViewRevenue = order.revenue * MAX_VIEW_CREDIT_SHARE;
    const orderResults: ViewThroughResult[] = [];

    for (const [platform, impressions] of impressionsByPlatform) {
      // Skip platforms the visitor already clicked on
      if (clickedPlatforms.has(platform)) continue;

      // Aggregate impressions for this platform in the visitor's journey window
      // Look back 30 days from conversion
      const convDate = new Date(order.converted_at);
      const windowStart = new Date(convDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      let bestProbability = 0;
      let bestCampaignId: string | null = null;

      // Group by campaign and find the highest-probability campaign
      const campaignImpressions = new Map<string | null, ImpressionRow[]>();
      for (const imp of impressions) {
        const impDate = new Date(imp.impression_date);
        if (impDate >= windowStart && impDate <= convDate) {
          const key = imp.campaign_id;
          const list = campaignImpressions.get(key) || [];
          list.push(imp);
          campaignImpressions.set(key, list);
        }
      }

      for (const [campaignId, campImps] of campaignImpressions) {
        // Calculate total impressions and weighted metrics for this campaign
        let totalImps = 0;
        let weightedDecay = 0;
        let maxReach = 0;

        for (const imp of campImps) {
          const impDate = new Date(imp.impression_date);
          const daysSince = (convDate.getTime() - impDate.getTime()) / (1000 * 60 * 60 * 24);
          const timeDecay = Math.exp(-daysSince / VT_DECAY_HALF_LIFE_DAYS);

          totalImps += imp.total_impressions;
          weightedDecay += imp.total_impressions * timeDecay;
          maxReach = Math.max(maxReach, imp.total_reach);
        }

        if (totalImps === 0) continue;

        // Calculate average frequency for this campaign
        const avgFrequency = maxReach > 0 ? totalImps / maxReach : 0;

        // Calculate probability components
        const frequencyFactor = Math.min(avgFrequency / 10, 1.0);
        const reachFactor = maxReach / Math.max(globalMaxReach, 1);
        const avgTimeDecay = totalImps > 0 ? weightedDecay / totalImps : 0;
        const baseRate = PLATFORM_BASE_RATES[platform] || DEFAULT_BASE_RATE;

        const probability = Math.min(
          MAX_VIEW_PROBABILITY,
          frequencyFactor * reachFactor * avgTimeDecay * baseRate,
        );

        if (probability > bestProbability) {
          bestProbability = probability;
          bestCampaignId = campaignId;
        }
      }

      if (bestProbability > 0.001) {
        // Check if adding this would exceed the cap
        const attributedRevenue = Math.min(
          parseFloat((order.revenue * bestProbability).toFixed(2)),
          maxViewRevenue - totalViewRevenue,
        );

        if (attributedRevenue > 0) {
          orderResults.push({
            visitor_id: order.visitor_id,
            order_id: order.order_id,
            platform,
            campaign_id: bestCampaignId,
            revenue: order.revenue,
            view_probability: bestProbability,
            attributed_revenue: attributedRevenue,
          });
          totalViewRevenue += attributedRevenue;
        }
      }
    }

    allResults.push(...orderResults);
  }

  // Step 4: Batch upsert results
  if (allResults.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < allResults.length; i += batchSize) {
      const batch = allResults.slice(i, i + batchSize);

      const placeholders: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      for (const r of batch) {
        placeholders.push(
          `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, 'v1', NOW())`,
        );
        values.push(
          userId,
          r.visitor_id,
          r.order_id,
          r.platform,
          r.campaign_id,
          r.revenue,
          r.view_probability,
          r.attributed_revenue,
        );
        paramIdx += 8;
      }

      await pool.query(
        `INSERT INTO view_through_results
           (user_id, visitor_id, order_id, platform, campaign_id, revenue, view_probability, attributed_revenue, model_version, computed_at)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (visitor_id, order_id, platform, campaign_id)
         DO UPDATE SET
           revenue = EXCLUDED.revenue,
           view_probability = EXCLUDED.view_probability,
           attributed_revenue = EXCLUDED.attributed_revenue,
           model_version = EXCLUDED.model_version,
           computed_at = NOW()`,
        values,
      );
    }
  }

  // Step 5: Update the attribution summary with view-through columns
  await updateSummaryWithViewThrough(userId, startDate, endDate);

  log.info(
    { userId, orders: orders.length, results: allResults.length },
    'View-through attribution computation complete',
  );

  return { orders: orders.length, results: allResults.length };
}

/**
 * Update pixel_attribution_summary with view-through conversions and revenue.
 * Aggregates from view_through_results and merges into existing summary rows.
 */
async function updateSummaryWithViewThrough(
  userId: number,
  startDate: string,
  endDate: string,
): Promise<void> {
  // Aggregate view-through by date + platform
  await pool.query(
    `UPDATE pixel_attribution_summary pas
     SET
       view_through_conversions = vt.vt_conversions,
       view_through_revenue = vt.vt_revenue
     FROM (
       SELECT
         computed_at::date AS date,
         platform,
         SUM(view_probability) AS vt_conversions,
         SUM(attributed_revenue) AS vt_revenue
       FROM view_through_results
       WHERE user_id = $1
         AND computed_at::date >= $2::date
         AND computed_at::date <= $3::date
       GROUP BY computed_at::date, platform
     ) vt
     WHERE pas.user_id = $1
       AND pas.date = vt.date
       AND pas.platform = vt.platform
       AND pas.date >= $2::date
       AND pas.date <= $3::date`,
    [userId, startDate, endDate],
  );
}

// ── Report queries ──────────────────────────────────────────────

/**
 * Get a view-through attribution report aggregated by platform.
 */
export async function getViewThroughReport(
  userId: number,
  startDate: string,
  endDate: string,
): Promise<ViewThroughReport> {
  // View-through data by platform
  const vtResult = await pool.query<{
    platform: string;
    impressions: string;
    view_conversions: string;
    view_revenue: string;
    avg_probability: string;
  }>(
    `SELECT
       vt.platform,
       COALESCE(pi.total_impressions, 0) AS impressions,
       COALESCE(SUM(vt.view_probability), 0) AS view_conversions,
       COALESCE(SUM(vt.attributed_revenue), 0) AS view_revenue,
       COALESCE(AVG(vt.view_probability), 0) AS avg_probability
     FROM view_through_results vt
     LEFT JOIN LATERAL (
       SELECT SUM(impressions) AS total_impressions
       FROM pixel_impressions
       WHERE user_id = $1
         AND platform = vt.platform
         AND date >= $2::date
         AND date <= $3::date
     ) pi ON true
     WHERE vt.user_id = $1
       AND vt.computed_at::date >= $2::date
       AND vt.computed_at::date <= $3::date
     GROUP BY vt.platform, pi.total_impressions
     ORDER BY view_revenue DESC`,
    [userId, startDate, endDate],
  );

  // Get total click-based revenue for the same period
  const clickResult = await pool.query<{ click_revenue: string }>(
    `SELECT COALESCE(SUM(attributed_revenue), 0) AS click_revenue
     FROM pixel_attribution_results
     WHERE user_id = $1
       AND model = 'last_click'
       AND computed_at::date >= $2::date
       AND computed_at::date <= $3::date`,
    [userId, startDate, endDate],
  );

  const platforms: PlatformViewReport[] = vtResult.rows.map((r) => ({
    platform: r.platform,
    impressions: parseInt(r.impressions, 10) || 0,
    view_conversions: parseFloat(parseFloat(r.view_conversions).toFixed(4)),
    view_revenue: parseFloat(parseFloat(r.view_revenue).toFixed(2)),
    avg_probability: parseFloat(parseFloat(r.avg_probability).toFixed(6)),
  }));

  const totalViewRevenue = platforms.reduce((sum, p) => sum + p.view_revenue, 0);
  const totalClickRevenue = parseFloat(clickResult.rows[0]?.click_revenue || '0');
  const combinedRevenue = totalViewRevenue + totalClickRevenue;
  const viewShare = combinedRevenue > 0
    ? ((totalViewRevenue / combinedRevenue) * 100).toFixed(1) + '%'
    : '0%';

  return {
    platforms,
    total_view_revenue: parseFloat(totalViewRevenue.toFixed(2)),
    total_click_revenue: parseFloat(totalClickRevenue.toFixed(2)),
    combined_revenue: parseFloat(combinedRevenue.toFixed(2)),
    view_share: viewShare,
  };
}

/**
 * Get combined click + view-through attribution per platform.
 * Provides the full picture of attribution by combining both models.
 */
export async function getCombinedAttribution(
  userId: number,
  startDate: string,
  endDate: string,
  model: AttributionModel = 'last_click',
): Promise<CombinedReport> {
  // Click-based attribution by platform
  const clickResult = await pool.query<{
    platform: string;
    click_conversions: string;
    click_revenue: string;
  }>(
    `SELECT
       tp.platform,
       COALESCE(SUM(r.credit), 0) AS click_conversions,
       COALESCE(SUM(r.attributed_revenue), 0) AS click_revenue
     FROM pixel_attribution_results r
     JOIN pixel_touchpoints tp ON tp.id = r.touchpoint_id
     WHERE r.user_id = $1
       AND r.model = $2
       AND r.computed_at::date >= $3::date
       AND r.computed_at::date <= $4::date
     GROUP BY tp.platform
     ORDER BY click_revenue DESC`,
    [userId, model, startDate, endDate],
  );

  // View-through attribution by platform
  const vtResult = await pool.query<{
    platform: string;
    view_conversions: string;
    view_revenue: string;
  }>(
    `SELECT
       platform,
       COALESCE(SUM(view_probability), 0) AS view_conversions,
       COALESCE(SUM(attributed_revenue), 0) AS view_revenue
     FROM view_through_results
     WHERE user_id = $1
       AND computed_at::date >= $2::date
       AND computed_at::date <= $3::date
     GROUP BY platform`,
    [userId, startDate, endDate],
  );

  // Merge into a single report
  const platformMap = new Map<string, CombinedPlatformRow>();

  for (const row of clickResult.rows) {
    platformMap.set(row.platform, {
      platform: row.platform,
      click_conversions: parseFloat(parseFloat(row.click_conversions).toFixed(4)),
      click_revenue: parseFloat(parseFloat(row.click_revenue).toFixed(2)),
      view_conversions: 0,
      view_revenue: 0,
      total_conversions: 0,
      total_revenue: 0,
    });
  }

  for (const row of vtResult.rows) {
    const existing = platformMap.get(row.platform);
    if (existing) {
      existing.view_conversions = parseFloat(parseFloat(row.view_conversions).toFixed(4));
      existing.view_revenue = parseFloat(parseFloat(row.view_revenue).toFixed(2));
    } else {
      platformMap.set(row.platform, {
        platform: row.platform,
        click_conversions: 0,
        click_revenue: 0,
        view_conversions: parseFloat(parseFloat(row.view_conversions).toFixed(4)),
        view_revenue: parseFloat(parseFloat(row.view_revenue).toFixed(2)),
        total_conversions: 0,
        total_revenue: 0,
      });
    }
  }

  // Calculate totals per platform
  const platforms: CombinedPlatformRow[] = [];
  const totals = {
    click_conversions: 0,
    click_revenue: 0,
    view_conversions: 0,
    view_revenue: 0,
    total_conversions: 0,
    total_revenue: 0,
  };

  for (const row of platformMap.values()) {
    row.total_conversions = parseFloat((row.click_conversions + row.view_conversions).toFixed(4));
    row.total_revenue = parseFloat((row.click_revenue + row.view_revenue).toFixed(2));
    platforms.push(row);

    totals.click_conversions += row.click_conversions;
    totals.click_revenue += row.click_revenue;
    totals.view_conversions += row.view_conversions;
    totals.view_revenue += row.view_revenue;
    totals.total_conversions += row.total_conversions;
    totals.total_revenue += row.total_revenue;
  }

  // Sort by total revenue descending
  platforms.sort((a, b) => b.total_revenue - a.total_revenue);

  // Round totals
  totals.click_conversions = parseFloat(totals.click_conversions.toFixed(4));
  totals.click_revenue = parseFloat(totals.click_revenue.toFixed(2));
  totals.view_conversions = parseFloat(totals.view_conversions.toFixed(4));
  totals.view_revenue = parseFloat(totals.view_revenue.toFixed(2));
  totals.total_conversions = parseFloat(totals.total_conversions.toFixed(4));
  totals.total_revenue = parseFloat(totals.total_revenue.toFixed(2));

  return { platforms, totals };
}

// ── Scheduled computation for all users ─────────────────────────

/**
 * Run view-through computation for all users.
 * Called from the scheduler daily at 3:30 AM (after click attribution at 3:00 AM).
 */
export async function computeViewThroughForAllUsers(): Promise<{
  usersProcessed: number;
  totalOrders: number;
  totalResults: number;
}> {
  const usersResult = await pool.query('SELECT DISTINCT id FROM users');
  const userIds: number[] = usersResult.rows.map((r) => r.id);

  let totalOrders = 0;
  let totalResults = 0;
  let usersProcessed = 0;

  const now = new Date();
  const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);

  for (const userId of userIds) {
    try {
      const result = await computeViewThrough(userId, startDate, endDate);
      totalOrders += result.orders;
      totalResults += result.results;
      if (result.orders > 0) usersProcessed++;
    } catch (err) {
      log.error({ userId, err }, 'View-through computation failed for user');
    }
  }

  log.info(
    { usersProcessed, totalOrders, totalResults },
    'View-through computation complete for all users',
  );

  return { usersProcessed, totalOrders, totalResults };
}
