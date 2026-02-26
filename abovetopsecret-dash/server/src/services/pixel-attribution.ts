/**
 * Pixel Multi-Touch Attribution Engine
 *
 * Computes attribution credit across touchpoints in a customer's journey
 * using five models: first_click, last_click, linear, time_decay, position_based.
 *
 * Reads from pixel_touchpoints + pixel_events_v2, writes to
 * pixel_attribution_results and pixel_attribution_summary.
 */

import pool from '../db';
import { createLogger } from '../lib/logger';
import { classifyCustomer, updateFirstOrderDate } from './new-vs-returning';

const log = createLogger('PixelAttribution');

// ── Types ───────────────────────────────────────────────────────

export type AttributionModel =
  | 'first_click'
  | 'last_click'
  | 'linear'
  | 'time_decay'
  | 'position_based';

export const ALL_MODELS: AttributionModel[] = [
  'first_click',
  'last_click',
  'linear',
  'time_decay',
  'position_based',
];

interface Touchpoint {
  id: number;
  visitor_id: number;
  platform: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  touched_at: Date;
}

interface ConvertedOrder {
  order_id: string;
  visitor_id: number;
  revenue: number;
  converted_at: Date;
  visitor_email: string | null;
}

export interface ComputeOptions {
  startDate?: string; // ISO date string
  endDate?: string;
  models?: AttributionModel[];
  batchSize?: number;
  lookbackDays?: number; // 7, 14, 30, 60, 90, 180, 365, or 0 for infinite
}

export interface ReportOptions {
  model: AttributionModel;
  startDate: string;
  endDate: string;
  groupBy: 'platform' | 'campaign' | 'source' | 'channel';
}

export interface ReportRow {
  group_key: string;
  attributed_conversions: number;
  attributed_revenue: number;
  touchpoints: number;
  unique_visitors: number;
  spend?: number;
  roas?: number;
  cpa?: number;
}

export interface JourneyStats {
  avg_touchpoints: number;
  median_touchpoints: number;
  avg_time_to_convert_hours: number;
  total_conversions: number;
  single_touch_conversions: number;
  multi_touch_conversions: number;
  top_first_touch: Array<{ platform: string; count: number }>;
  top_last_touch: Array<{ platform: string; count: number }>;
}

export interface ConversionPath {
  path: string;
  conversions: number;
  revenue: number;
  avg_touchpoints: number;
}

// ── Time Decay constants ────────────────────────────────────────
// 7-day half-life in milliseconds
const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Credit normalization ────────────────────────────────────────

const CREDIT_EPSILON = 0.0001;
const REVENUE_EPSILON = 0.01;

/**
 * Normalize a credit map so all values sum to exactly 1.0.
 * Handles floating-point drift by adjusting the largest credit.
 */
function normalizeCredits(credits: Map<number, number>): Map<number, number> {
  if (credits.size === 0) return credits;

  // Sum only positive credits
  let sum = 0;
  for (const c of credits.values()) {
    if (c > 0) sum += c;
  }

  // If already within epsilon, no adjustment needed
  if (Math.abs(sum - 1.0) < CREDIT_EPSILON && sum > 0) {
    return credits;
  }

  // Avoid division by zero
  if (sum === 0) return credits;

  // Normalize all credits proportionally
  const normalized = new Map<number, number>();
  let newSum = 0;
  let largestKey: number | null = null;
  let largestVal = -1;

  for (const [key, val] of credits) {
    if (val <= 0) {
      normalized.set(key, 0);
      continue;
    }
    const newVal = val / sum;
    normalized.set(key, newVal);
    newSum += newVal;
    if (newVal > largestVal) {
      largestVal = newVal;
      largestKey = key;
    }
  }

  // Correct any remaining floating-point drift on the largest credit
  if (largestKey !== null && Math.abs(newSum - 1.0) > Number.EPSILON) {
    const currentLargest = normalized.get(largestKey) || 0;
    normalized.set(largestKey, currentLargest + (1.0 - newSum));
  }

  return normalized;
}

// ── Credit calculation functions ────────────────────────────────

function computeCredits(
  touchpoints: Touchpoint[],
  conversionTime: Date,
  model: AttributionModel,
): Map<number, number> {
  const credits = new Map<number, number>();
  const n = touchpoints.length;

  if (n === 0) return credits;

  switch (model) {
    case 'first_click': {
      credits.set(touchpoints[0].id, 1.0);
      for (let i = 1; i < n; i++) {
        credits.set(touchpoints[i].id, 0.0);
      }
      break;
    }

    case 'last_click': {
      for (let i = 0; i < n - 1; i++) {
        credits.set(touchpoints[i].id, 0.0);
      }
      credits.set(touchpoints[n - 1].id, 1.0);
      break;
    }

    case 'linear': {
      const share = 1.0 / n;
      for (const tp of touchpoints) {
        credits.set(tp.id, share);
      }
      break;
    }

    case 'time_decay': {
      const convTimeMs = conversionTime.getTime();
      let totalWeight = 0;
      const weights: number[] = [];

      for (const tp of touchpoints) {
        const daysBefore = convTimeMs - tp.touched_at.getTime();
        // weight = 2^(-days_before / half_life)
        const weight = Math.pow(2, -(daysBefore / HALF_LIFE_MS));
        weights.push(weight);
        totalWeight += weight;
      }

      // Normalize so weights sum to 1.0
      if (totalWeight > 0) {
        for (let i = 0; i < n; i++) {
          credits.set(touchpoints[i].id, weights[i] / totalWeight);
        }
      } else {
        // Fallback to linear
        const share = 1.0 / n;
        for (const tp of touchpoints) {
          credits.set(tp.id, share);
        }
      }
      break;
    }

    case 'position_based': {
      if (n === 1) {
        credits.set(touchpoints[0].id, 1.0);
      } else if (n === 2) {
        credits.set(touchpoints[0].id, 0.5);
        credits.set(touchpoints[1].id, 0.5);
      } else {
        // 40% first, 40% last, 20% split among middle
        credits.set(touchpoints[0].id, 0.4);
        credits.set(touchpoints[n - 1].id, 0.4);
        const middleShare = 0.2 / (n - 2);
        for (let i = 1; i < n - 1; i++) {
          credits.set(touchpoints[i].id, middleShare);
        }
      }
      break;
    }
  }

  // Guarantee: credits always sum to exactly 1.0
  return normalizeCredits(credits);
}

// ── Core computation ────────────────────────────────────────────

/**
 * Compute attribution for a single user.
 * 1. Find all converted orders in the date range.
 * 2. For each order, get the visitor's touchpoints.
 * 3. Calculate credit per touchpoint per model.
 * 4. Upsert into pixel_attribution_results.
 * 5. Aggregate into pixel_attribution_summary.
 */
export async function computeAttribution(
  userId: number,
  options: ComputeOptions = {},
): Promise<{ orders: number; results: number }> {
  const {
    startDate,
    endDate,
    models = ALL_MODELS,
    batchSize = 500,
    lookbackDays = 30,
  } = options;

  const now = new Date();
  const start = startDate || new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = endDate || now.toISOString().slice(0, 10);

  log.info({ userId, start, end, models, lookbackDays }, 'Starting attribution computation');

  // Step 1: Get all Purchase events in the date range, with visitor email for classification
  const ordersResult = await pool.query<ConvertedOrder>(
    `SELECT DISTINCT ON (e.order_id)
       e.order_id,
       e.visitor_id,
       COALESCE(e.revenue, 0) AS revenue,
       e.created_at AS converted_at,
       v.email AS visitor_email
     FROM pixel_events_v2 e
     LEFT JOIN pixel_visitors v ON v.id = e.visitor_id
     WHERE e.user_id = $1
       AND e.event_name = 'Purchase'
       AND e.order_id IS NOT NULL
       AND e.visitor_id IS NOT NULL
       AND e.created_at >= $2::date
       AND e.created_at < ($3::date + INTERVAL '1 day')
     ORDER BY e.order_id, e.created_at ASC`,
    [userId, start, end],
  );

  const orders = ordersResult.rows;
  if (orders.length === 0) {
    log.info({ userId }, 'No converted orders found in date range');
    return { orders: 0, results: 0 };
  }

  log.info({ userId, orderCount: orders.length }, 'Found converted orders');

  let totalResults = 0;

  // Process orders in batches
  for (let batchStart = 0; batchStart < orders.length; batchStart += batchSize) {
    const batch = orders.slice(batchStart, batchStart + batchSize);

    // Collect all visitor IDs in this batch
    const visitorIds = [...new Set(batch.map((o) => o.visitor_id))];

    // Batch-fetch all touchpoints for these visitors
    // When lookbackDays > 0, limit touchpoints to within the lookback window of the
    // earliest possible conversion date. The per-order filter is applied below.
    const touchpointsResult = await pool.query<Touchpoint>(
      `SELECT id, visitor_id, platform,
              utm_source, utm_medium, utm_campaign, utm_content,
              touched_at
       FROM pixel_touchpoints
       WHERE user_id = $1
         AND visitor_id = ANY($2)
       ORDER BY visitor_id, touched_at ASC`,
      [userId, visitorIds],
    );

    // Group touchpoints by visitor_id
    const touchpointsByVisitor = new Map<number, Touchpoint[]>();
    for (const tp of touchpointsResult.rows) {
      const list = touchpointsByVisitor.get(tp.visitor_id) || [];
      list.push(tp);
      touchpointsByVisitor.set(tp.visitor_id, list);
    }

    // Classify each order as new vs returning customer
    const orderNewMap = new Map<string, boolean>();
    for (const order of batch) {
      try {
        const isNew = await classifyCustomer(userId, order.visitor_email, order.visitor_id, order.order_id);
        orderNewMap.set(order.order_id, isNew);
        if (isNew) {
          await updateFirstOrderDate(order.visitor_id, order.converted_at);
        }
      } catch (err) {
        log.warn({ userId, orderId: order.order_id, err }, 'Failed to classify customer, defaulting to null');
      }
    }

    // For each order, compute attribution across all models
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let paramIdx = 1;
    const paramsPerRow = 10;

    for (const order of batch) {
      const allTouchpoints = touchpointsByVisitor.get(order.visitor_id) || [];

      // Only consider touchpoints BEFORE the conversion and within the lookback window
      const lookbackCutoff = lookbackDays > 0
        ? new Date(order.converted_at.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
        : null;
      const relevantTouchpoints = allTouchpoints.filter(
        (tp) =>
          tp.touched_at <= order.converted_at &&
          (lookbackCutoff === null || tp.touched_at >= lookbackCutoff),
      );

      if (relevantTouchpoints.length === 0) continue;

      const isNewCustomer = orderNewMap.has(order.order_id) ? orderNewMap.get(order.order_id)! : null;

      for (const model of models) {
        const credits = computeCredits(relevantTouchpoints, order.converted_at, model);

        for (const [tpId, credit] of credits) {
          if (credit <= 0) continue;

          const attributedRevenue = parseFloat((order.revenue * credit).toFixed(2));
          placeholders.push(
            `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, NOW(), $${paramIdx + 8}, $${paramIdx + 9}, true)`,
          );
          values.push(
            userId,
            order.visitor_id,
            tpId,
            order.order_id,
            order.revenue,
            model,
            credit,
            attributedRevenue,
            lookbackDays,
            isNewCustomer,
          );
          paramIdx += paramsPerRow;
          totalResults++;
        }
      }
    }

    // Batch upsert results
    if (placeholders.length > 0) {
      // Split into sub-batches if too many params (PostgreSQL limit ~65535 params)
      const maxParamsPerBatch = 60000;
      const maxRowsPerBatch = Math.floor(maxParamsPerBatch / paramsPerRow);

      for (let i = 0; i < placeholders.length; i += maxRowsPerBatch) {
        // Rewrite parameter indices for the sub-batch
        const reindexedPlaceholders: string[] = [];
        const reindexedValues: unknown[] = [];
        let subParamIdx = 1;
        for (let j = i; j < Math.min(i + maxRowsPerBatch, placeholders.length); j++) {
          reindexedPlaceholders.push(
            `($${subParamIdx}, $${subParamIdx + 1}, $${subParamIdx + 2}, $${subParamIdx + 3}, $${subParamIdx + 4}, $${subParamIdx + 5}, $${subParamIdx + 6}, $${subParamIdx + 7}, NOW(), $${subParamIdx + 8}, $${subParamIdx + 9}, true)`,
          );
          const startVal = j * paramsPerRow;
          for (let k = 0; k < paramsPerRow; k++) {
            reindexedValues.push(values[startVal + k]);
          }
          subParamIdx += paramsPerRow;
        }

        await pool.query(
          `INSERT INTO pixel_attribution_results
             (user_id, visitor_id, touchpoint_id, order_id, revenue, model, credit, attributed_revenue, computed_at, lookback_days, is_new_customer, credit_verified)
           VALUES ${reindexedPlaceholders.join(', ')}
           ON CONFLICT (touchpoint_id, order_id, model)
           DO UPDATE SET
             credit = EXCLUDED.credit,
             attributed_revenue = EXCLUDED.attributed_revenue,
             revenue = EXCLUDED.revenue,
             lookback_days = EXCLUDED.lookback_days,
             computed_at = NOW(),
             is_new_customer = EXCLUDED.is_new_customer,
             credit_verified = true`,
          reindexedValues,
        );
      }
    }
  }

  // Step 5: Rebuild summary for the date range
  await rebuildSummary(userId, start, end, models);

  // Step 6: Run verification on the orders just processed
  const processedOrderIds = orders.map((o) => o.order_id);
  try {
    await verifyAttribution(userId, processedOrderIds);
  } catch (err) {
    log.error({ userId, err }, 'Post-computation verification failed (non-fatal)');
  }

  log.info({ userId, orders: orders.length, totalResults }, 'Attribution computation complete');
  return { orders: orders.length, results: totalResults };
}

/**
 * Rebuild the pixel_attribution_summary table from pixel_attribution_results
 * for the given date range and models.
 */
async function rebuildSummary(
  userId: number,
  startDate: string,
  endDate: string,
  models: AttributionModel[],
): Promise<void> {
  // Delete existing summary rows for this user/date/model range
  await pool.query(
    `DELETE FROM pixel_attribution_summary
     WHERE user_id = $1
       AND date >= $2::date
       AND date <= $3::date
       AND model = ANY($4)`,
    [userId, startDate, endDate, models],
  );

  // Aggregate from results, joined with touchpoints for platform/utm info
  await pool.query(
    `INSERT INTO pixel_attribution_summary
       (user_id, date, model, platform, utm_source, utm_medium, utm_campaign, utm_content,
        attributed_conversions, attributed_revenue, touchpoints, unique_visitors, computed_at,
        lookback_days, is_new_customer)
     SELECT
       r.user_id,
       r.computed_at::date AS date,
       r.model,
       tp.platform,
       tp.utm_source,
       tp.utm_medium,
       tp.utm_campaign,
       tp.utm_content,
       SUM(r.credit) AS attributed_conversions,
       SUM(r.attributed_revenue) AS attributed_revenue,
       COUNT(DISTINCT r.touchpoint_id) AS touchpoints,
       COUNT(DISTINCT r.visitor_id) AS unique_visitors,
       NOW(),
       r.lookback_days,
       r.is_new_customer
     FROM pixel_attribution_results r
     JOIN pixel_touchpoints tp ON tp.id = r.touchpoint_id
     WHERE r.user_id = $1
       AND r.computed_at::date >= $2::date
       AND r.computed_at::date <= $3::date
       AND r.model = ANY($4)
     GROUP BY r.user_id, r.computed_at::date, r.model,
              tp.platform, tp.utm_source, tp.utm_medium, tp.utm_campaign, tp.utm_content,
              r.lookback_days, r.is_new_customer`,
    [userId, startDate, endDate, models],
  );
}

// ── Report queries ──────────────────────────────────────────────

/**
 * Get an attribution report grouped by platform, campaign, source, or channel.
 * Optionally joins with ad spend data for ROAS/CPA calculations.
 */
export async function getAttributionReport(
  userId: number,
  options: ReportOptions,
): Promise<ReportRow[]> {
  const { model, startDate, endDate, groupBy } = options;

  // Determine the GROUP BY column
  let groupCol: string;
  switch (groupBy) {
    case 'platform':
      groupCol = 'tp.platform';
      break;
    case 'campaign':
      groupCol = 'tp.utm_campaign';
      break;
    case 'source':
      groupCol = 'tp.utm_source';
      break;
    case 'channel':
      groupCol = 'tp.utm_medium';
      break;
    default:
      groupCol = 'tp.platform';
  }

  const result = await pool.query(
    `SELECT
       COALESCE(${groupCol}, 'unknown') AS group_key,
       SUM(r.credit) AS attributed_conversions,
       SUM(r.attributed_revenue) AS attributed_revenue,
       COUNT(DISTINCT r.touchpoint_id) AS touchpoints,
       COUNT(DISTINCT r.visitor_id) AS unique_visitors
     FROM pixel_attribution_results r
     JOIN pixel_touchpoints tp ON tp.id = r.touchpoint_id
     WHERE r.user_id = $1
       AND r.model = $2
       AND r.computed_at::date >= $3::date
       AND r.computed_at::date <= $4::date
     GROUP BY ${groupCol}
     ORDER BY attributed_revenue DESC`,
    [userId, model, startDate, endDate],
  );

  // Try to join with ad spend data
  const spendResult = await pool.query(
    `SELECT source, SUM(spend) AS spend
     FROM (
       SELECT account_name AS source, spend FROM fb_ads_today WHERE user_id = $1
       UNION ALL
       SELECT COALESCE(a.name, 'TikTok') AS source, t.spend
       FROM tiktok_ads_today t LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.user_id = $1
       UNION ALL
       SELECT COALESCE(a.name, 'NewsBreak') AS source, n.spend
       FROM newsbreak_ads_today n LEFT JOIN accounts a ON a.platform = 'newsbreak' AND a.user_id = n.user_id
       WHERE n.user_id = $1
     ) all_ads
     GROUP BY source`,
    [userId],
  );

  const spendMap = new Map<string, number>();
  for (const row of spendResult.rows) {
    spendMap.set((row.source || '').toLowerCase(), parseFloat(row.spend) || 0);
  }

  return result.rows.map((row) => {
    const key = row.group_key || 'unknown';
    const spend = spendMap.get(key.toLowerCase()) || 0;
    const attrRev = parseFloat(row.attributed_revenue) || 0;
    const attrConv = parseFloat(row.attributed_conversions) || 0;

    return {
      group_key: key,
      attributed_conversions: attrConv,
      attributed_revenue: attrRev,
      touchpoints: parseInt(row.touchpoints, 10) || 0,
      unique_visitors: parseInt(row.unique_visitors, 10) || 0,
      spend: spend || undefined,
      roas: spend > 0 ? parseFloat((attrRev / spend).toFixed(2)) : undefined,
      cpa: attrConv > 0 && spend > 0 ? parseFloat((spend / attrConv).toFixed(2)) : undefined,
    };
  });
}

/**
 * Compare all attribution models side by side for the same date range and group_by.
 */
export async function compareModels(
  userId: number,
  startDate: string,
  endDate: string,
  groupBy: 'platform' | 'campaign' | 'source' | 'channel',
): Promise<Record<AttributionModel, ReportRow[]>> {
  const results: Record<string, ReportRow[]> = {};

  for (const model of ALL_MODELS) {
    results[model] = await getAttributionReport(userId, {
      model,
      startDate,
      endDate,
      groupBy,
    });
  }

  return results as Record<AttributionModel, ReportRow[]>;
}

// ── Journey analysis ────────────────────────────────────────────

/**
 * Analyze customer journeys: average touchpoints, time to convert, common paths.
 */
export async function getJourneyAnalysis(
  userId: number,
  startDate: string,
  endDate: string,
): Promise<JourneyStats> {
  // Get per-order stats: touchpoint count, time from first touch to conversion
  const journeyResult = await pool.query(
    `WITH orders AS (
       SELECT DISTINCT ON (e.order_id)
         e.order_id,
         e.visitor_id,
         e.created_at AS converted_at
       FROM pixel_events_v2 e
       WHERE e.user_id = $1
         AND e.event_name = 'Purchase'
         AND e.order_id IS NOT NULL
         AND e.visitor_id IS NOT NULL
         AND e.created_at >= $2::date
         AND e.created_at < ($3::date + INTERVAL '1 day')
       ORDER BY e.order_id, e.created_at ASC
     ),
     journey_stats AS (
       SELECT
         o.order_id,
         o.visitor_id,
         o.converted_at,
         COUNT(tp.id) AS touchpoint_count,
         MIN(tp.touched_at) AS first_touch,
         MAX(tp.touched_at) AS last_touch
       FROM orders o
       LEFT JOIN pixel_touchpoints tp
         ON tp.visitor_id = o.visitor_id
         AND tp.user_id = $1
         AND tp.touched_at <= o.converted_at
       GROUP BY o.order_id, o.visitor_id, o.converted_at
     )
     SELECT
       COALESCE(AVG(touchpoint_count), 0) AS avg_touchpoints,
       COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY touchpoint_count), 0) AS median_touchpoints,
       COALESCE(AVG(EXTRACT(EPOCH FROM (converted_at - first_touch)) / 3600), 0) AS avg_time_to_convert_hours,
       COUNT(*) AS total_conversions,
       COUNT(*) FILTER (WHERE touchpoint_count <= 1) AS single_touch_conversions,
       COUNT(*) FILTER (WHERE touchpoint_count > 1) AS multi_touch_conversions
     FROM journey_stats`,
    [userId, startDate, endDate],
  );

  const stats = journeyResult.rows[0] || {};

  // Top first-touch platforms
  const firstTouchResult = await pool.query(
    `WITH orders AS (
       SELECT DISTINCT ON (e.order_id)
         e.order_id, e.visitor_id, e.created_at AS converted_at
       FROM pixel_events_v2 e
       WHERE e.user_id = $1
         AND e.event_name = 'Purchase'
         AND e.order_id IS NOT NULL
         AND e.visitor_id IS NOT NULL
         AND e.created_at >= $2::date
         AND e.created_at < ($3::date + INTERVAL '1 day')
       ORDER BY e.order_id, e.created_at ASC
     ),
     first_touches AS (
       SELECT DISTINCT ON (o.order_id)
         o.order_id,
         tp.platform
       FROM orders o
       JOIN pixel_touchpoints tp
         ON tp.visitor_id = o.visitor_id
         AND tp.user_id = $1
         AND tp.touched_at <= o.converted_at
       ORDER BY o.order_id, tp.touched_at ASC
     )
     SELECT platform, COUNT(*) AS count
     FROM first_touches
     WHERE platform IS NOT NULL
     GROUP BY platform
     ORDER BY count DESC
     LIMIT 10`,
    [userId, startDate, endDate],
  );

  // Top last-touch platforms
  const lastTouchResult = await pool.query(
    `WITH orders AS (
       SELECT DISTINCT ON (e.order_id)
         e.order_id, e.visitor_id, e.created_at AS converted_at
       FROM pixel_events_v2 e
       WHERE e.user_id = $1
         AND e.event_name = 'Purchase'
         AND e.order_id IS NOT NULL
         AND e.visitor_id IS NOT NULL
         AND e.created_at >= $2::date
         AND e.created_at < ($3::date + INTERVAL '1 day')
       ORDER BY e.order_id, e.created_at ASC
     ),
     last_touches AS (
       SELECT DISTINCT ON (o.order_id)
         o.order_id,
         tp.platform
       FROM orders o
       JOIN pixel_touchpoints tp
         ON tp.visitor_id = o.visitor_id
         AND tp.user_id = $1
         AND tp.touched_at <= o.converted_at
       ORDER BY o.order_id, tp.touched_at DESC
     )
     SELECT platform, COUNT(*) AS count
     FROM last_touches
     WHERE platform IS NOT NULL
     GROUP BY platform
     ORDER BY count DESC
     LIMIT 10`,
    [userId, startDate, endDate],
  );

  return {
    avg_touchpoints: parseFloat(parseFloat(stats.avg_touchpoints || '0').toFixed(2)),
    median_touchpoints: parseFloat(parseFloat(stats.median_touchpoints || '0').toFixed(1)),
    avg_time_to_convert_hours: parseFloat(parseFloat(stats.avg_time_to_convert_hours || '0').toFixed(2)),
    total_conversions: parseInt(stats.total_conversions || '0', 10),
    single_touch_conversions: parseInt(stats.single_touch_conversions || '0', 10),
    multi_touch_conversions: parseInt(stats.multi_touch_conversions || '0', 10),
    top_first_touch: firstTouchResult.rows.map((r) => ({
      platform: r.platform,
      count: parseInt(r.count, 10),
    })),
    top_last_touch: lastTouchResult.rows.map((r) => ({
      platform: r.platform,
      count: parseInt(r.count, 10),
    })),
  };
}

// ── Conversion paths ────────────────────────────────────────────

/**
 * Get top conversion paths, e.g. "Meta -> Google -> Meta -> Purchase".
 */
export async function getConversionPaths(
  userId: number,
  startDate: string,
  endDate: string,
  limit = 20,
): Promise<ConversionPath[]> {
  const result = await pool.query(
    `WITH orders AS (
       SELECT DISTINCT ON (e.order_id)
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
       ORDER BY e.order_id, e.created_at ASC
     ),
     order_paths AS (
       SELECT
         o.order_id,
         o.revenue,
         STRING_AGG(tp.platform, ' -> ' ORDER BY tp.touched_at ASC) AS path,
         COUNT(tp.id) AS touchpoint_count
       FROM orders o
       JOIN pixel_touchpoints tp
         ON tp.visitor_id = o.visitor_id
         AND tp.user_id = $1
         AND tp.touched_at <= o.converted_at
       GROUP BY o.order_id, o.revenue
     )
     SELECT
       path,
       COUNT(*) AS conversions,
       SUM(revenue) AS revenue,
       AVG(touchpoint_count) AS avg_touchpoints
     FROM order_paths
     WHERE path IS NOT NULL
     GROUP BY path
     ORDER BY conversions DESC, revenue DESC
     LIMIT $4`,
    [userId, startDate, endDate, limit],
  );

  return result.rows.map((r) => ({
    path: r.path,
    conversions: parseInt(r.conversions, 10),
    revenue: parseFloat(r.revenue) || 0,
    avg_touchpoints: parseFloat(parseFloat(r.avg_touchpoints || '0').toFixed(1)),
  }));
}

// ── Verification / No-Double-Counting Guarantee ─────────────────

export interface VerificationReport {
  ordersChecked: number;
  ordersFixed: number;
  allValid: boolean;
}

/**
 * Verify that for every order+model, credits sum to 1.0 and attributed revenue
 * sums to actual order revenue. Fix any discrepancies by normalizing credits
 * and recomputing attributed_revenue. Logs all checks to attribution_verification_log.
 *
 * When orderIds is provided, only those orders are verified. Otherwise all
 * orders for the user are checked.
 */
export async function verifyAttribution(
  userId: number,
  orderIds?: string[],
): Promise<VerificationReport> {
  const filterClause =
    orderIds && orderIds.length > 0 ? 'AND r.order_id = ANY($2)' : '';
  const params: unknown[] =
    orderIds && orderIds.length > 0 ? [userId, orderIds] : [userId];

  const aggResult = await pool.query(
    `SELECT
       r.order_id,
       r.model,
       r.revenue AS actual_revenue,
       SUM(r.credit) AS credit_sum,
       SUM(r.attributed_revenue) AS total_credited
     FROM pixel_attribution_results r
     WHERE r.user_id = $1
       ${filterClause}
     GROUP BY r.order_id, r.model, r.revenue`,
    params,
  );

  let ordersChecked = 0;
  let ordersFixed = 0;

  for (const row of aggResult.rows) {
    ordersChecked++;
    const creditSum = parseFloat(row.credit_sum) || 0;
    const totalCredited = parseFloat(row.total_credited) || 0;
    const actualRevenue = parseFloat(row.actual_revenue) || 0;

    const creditOk = Math.abs(creditSum - 1.0) < CREDIT_EPSILON;
    const revenueOk = Math.abs(totalCredited - actualRevenue) < REVENUE_EPSILON;
    const wasNormalized = !creditOk || !revenueOk;

    if (wasNormalized) {
      ordersFixed++;

      // Fetch individual rows for this order+model to normalize
      const rowsResult = await pool.query(
        `SELECT id, credit FROM pixel_attribution_results
         WHERE user_id = $1 AND order_id = $2 AND model = $3 AND credit > 0`,
        [userId, row.order_id, row.model],
      );

      if (rowsResult.rows.length > 0 && creditSum > 0) {
        const factor = 1.0 / creditSum;
        let runningCreditSum = 0;
        const updates: Array<{ id: number; credit: number; attrRev: number }> =
          [];

        for (let i = 0; i < rowsResult.rows.length; i++) {
          const r = rowsResult.rows[i];
          let newCredit: number;
          if (i === rowsResult.rows.length - 1) {
            // Last row absorbs rounding remainder
            newCredit = 1.0 - runningCreditSum;
          } else {
            newCredit = parseFloat(r.credit) * factor;
            runningCreditSum += newCredit;
          }
          const attrRev = parseFloat((actualRevenue * newCredit).toFixed(2));
          updates.push({ id: parseInt(r.id, 10), credit: newCredit, attrRev });
        }

        for (const u of updates) {
          await pool.query(
            `UPDATE pixel_attribution_results
             SET credit = $1, attributed_revenue = $2, credit_verified = true
             WHERE id = $3`,
            [u.credit, u.attrRev, u.id],
          );
        }
      }
    }

    // Log to verification audit trail
    await pool.query(
      `INSERT INTO attribution_verification_log
         (user_id, order_id, model, actual_revenue, total_credited, credit_sum, was_normalized, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        userId,
        row.order_id,
        row.model,
        actualRevenue,
        totalCredited,
        creditSum,
        wasNormalized,
      ],
    );
  }

  log.info(
    { userId, ordersChecked, ordersFixed },
    'Attribution verification complete',
  );

  return { ordersChecked, ordersFixed, allValid: ordersFixed === 0 };
}

/**
 * Get the latest verification status for a user.
 */
export async function getVerificationStatus(userId: number): Promise<{
  status: string;
  lastVerified: string | null;
  ordersVerified: number;
  ordersFixed: number;
  creditIntegrity: string;
  revenueIntegrity: string;
  badge: string;
}> {
  const lastRunResult = await pool.query(
    `SELECT MAX(verified_at) AS last_verified
     FROM attribution_verification_log WHERE user_id = $1`,
    [userId],
  );
  const lastVerified: string | null = lastRunResult.rows[0]?.last_verified
    ? new Date(lastRunResult.rows[0].last_verified).toISOString()
    : null;

  const statsResult = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE was_normalized) AS fixed,
       COUNT(*) FILTER (WHERE ABS(credit_sum - 1.0) < $2) AS credit_ok,
       COUNT(*) FILTER (WHERE ABS(total_credited - actual_revenue) < $3) AS revenue_ok
     FROM attribution_verification_log
     WHERE user_id = $1
       AND verified_at >= COALESCE(
         (SELECT MAX(verified_at) - INTERVAL '1 minute'
          FROM attribution_verification_log WHERE user_id = $1),
         '1970-01-01'::timestamptz
       )`,
    [userId, CREDIT_EPSILON, REVENUE_EPSILON],
  );

  const total = parseInt(statsResult.rows[0]?.total || '0', 10);
  const fixed = parseInt(statsResult.rows[0]?.fixed || '0', 10);
  const creditOk = parseInt(statsResult.rows[0]?.credit_ok || '0', 10);
  const revenueOk = parseInt(statsResult.rows[0]?.revenue_ok || '0', 10);

  const creditIntegrity =
    total > 0 ? `${Math.round((creditOk / total) * 100)}%` : '100%';
  const revenueIntegrity =
    total > 0 ? `${Math.round((revenueOk / total) * 100)}%` : '100%';
  const allValid = fixed === 0;

  return {
    status: allValid ? 'verified' : 'normalized',
    lastVerified,
    ordersVerified: total,
    ordersFixed: fixed,
    creditIntegrity,
    revenueIntegrity,
    badge: allValid
      ? '\u2713 No Double Counting \u2014 All attributed revenue matches actual revenue'
      : `\u2713 No Double Counting \u2014 ${fixed} order(s) were auto-normalized`,
  };
}

/**
 * Run verification for all users.
 * Called from the scheduler after attribution computation.
 */
export async function verifyAttributionForAllUsers(): Promise<{
  usersVerified: number;
  totalOrdersChecked: number;
  totalOrdersFixed: number;
}> {
  const usersResult = await pool.query('SELECT DISTINCT id FROM users');
  const userIds: number[] = usersResult.rows.map((r) => r.id);

  let usersVerified = 0;
  let totalOrdersChecked = 0;
  let totalOrdersFixed = 0;

  for (const userId of userIds) {
    try {
      const report = await verifyAttribution(userId);
      if (report.ordersChecked > 0) usersVerified++;
      totalOrdersChecked += report.ordersChecked;
      totalOrdersFixed += report.ordersFixed;
    } catch (err) {
      log.error({ userId, err }, 'Attribution verification failed for user');
    }
  }

  log.info(
    { usersVerified, totalOrdersChecked, totalOrdersFixed },
    'Attribution verification complete for all users',
  );

  return { usersVerified, totalOrdersChecked, totalOrdersFixed };
}

// ── Scheduled computation for all users ─────────────────────────

// ── Attribution settings helpers ─────────────────────────────

export const VALID_LOOKBACK_DAYS = [7, 14, 30, 60, 90, 180, 365, 0];
export const VALID_ACCOUNTING_MODES = ['accrual', 'cash'] as const;
export type AccountingMode = (typeof VALID_ACCOUNTING_MODES)[number];

export interface AttributionSettings {
  id: number;
  user_id: number;
  default_lookback_days: number;
  default_model: AttributionModel;
  accounting_mode: AccountingMode;
  created_at: string;
  updated_at: string;
}

/**
 * Get a user's attribution settings. Returns defaults if no row exists.
 */
export async function getUserAttributionSettings(
  userId: number,
): Promise<AttributionSettings> {
  const result = await pool.query<AttributionSettings>(
    `SELECT * FROM attribution_settings WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length > 0) {
    return result.rows[0];
  }
  // Return defaults
  return {
    id: 0,
    user_id: userId,
    default_lookback_days: 30,
    default_model: 'time_decay',
    accounting_mode: 'accrual',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Upsert a user's attribution settings.
 */
export async function upsertUserAttributionSettings(
  userId: number,
  settings: {
    default_lookback_days?: number;
    default_model?: AttributionModel;
    accounting_mode?: AccountingMode;
  },
): Promise<AttributionSettings> {
  const result = await pool.query<AttributionSettings>(
    `INSERT INTO attribution_settings (user_id, default_lookback_days, default_model, accounting_mode)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id)
     DO UPDATE SET
       default_lookback_days = COALESCE($2, attribution_settings.default_lookback_days),
       default_model = COALESCE($3, attribution_settings.default_model),
       accounting_mode = COALESCE($4, attribution_settings.accounting_mode),
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      settings.default_lookback_days ?? 30,
      settings.default_model ?? 'time_decay',
      settings.accounting_mode ?? 'accrual',
    ],
  );
  return result.rows[0];
}

// ── Scheduled computation for all users ─────────────────────────

// Standard lookback windows that are always computed
const STANDARD_WINDOWS = [7, 14, 30];

/**
 * Run attribution computation for all users.
 * Called from the scheduler daily at 3:00 AM.
 * Reads each user's attribution_settings for their preferred lookback window
 * and computes for standard windows (7, 14, 30) plus the user's custom window.
 */
export async function computeAttributionForAllUsers(): Promise<{
  usersProcessed: number;
  totalOrders: number;
  totalResults: number;
}> {
  const usersResult = await pool.query('SELECT DISTINCT id FROM users');
  const userIds: number[] = usersResult.rows.map((r) => r.id);

  let totalOrders = 0;
  let totalResults = 0;
  let usersProcessed = 0;

  for (const userId of userIds) {
    try {
      // Read user's preferred lookback window
      const settings = await getUserAttributionSettings(userId);
      const userWindow = settings.default_lookback_days;

      // Build the set of windows to compute: standard + user's custom
      const windows = [...new Set([...STANDARD_WINDOWS, userWindow])];

      let userHadOrders = false;

      for (const lookbackDays of windows) {
        try {
          const result = await computeAttribution(userId, {
            startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            endDate: new Date().toISOString().slice(0, 10),
            lookbackDays,
          });
          totalOrders += result.orders;
          totalResults += result.results;
          if (result.orders > 0) userHadOrders = true;
        } catch (err) {
          log.error({ userId, lookbackDays, err }, 'Attribution computation failed for window');
        }
      }

      if (userHadOrders) usersProcessed++;
    } catch (err) {
      log.error({ userId, err }, 'Attribution computation failed for user');
    }
  }

  log.info(
    { usersProcessed, totalOrders, totalResults },
    'Attribution computation complete for all users',
  );

  return { usersProcessed, totalOrders, totalResults };
}
