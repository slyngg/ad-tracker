/**
 * Profit Benchmarks + Campaign Stoplights Service
 *
 * Computes KPI benchmarks from historical profitable days and assigns
 * scale / watch / cut signals to active campaigns based on those thresholds.
 */

import pool from '../db';
import { createLogger } from '../lib/logger';
import { getSetting } from './settings';
import { evaluateStoplightRules } from './rules-engine';

const log = createLogger('Benchmarks');

// ── Types ────────────────────────────────────────────────────────

export type BenchmarkMetric = 'roas' | 'cpa' | 'ncpa' | 'mer' | 'aov' | 'profit_margin';

export const ALL_METRICS: BenchmarkMetric[] = [
  'roas', 'cpa', 'ncpa', 'mer', 'aov', 'profit_margin',
];

export type Signal = 'scale' | 'watch' | 'cut';

export interface Benchmark {
  metric: BenchmarkMetric;
  threshold_green: number | null;
  threshold_amber: number | null;
  auto_computed: boolean;
  last_computed: string | null;
}

export interface Stoplight {
  id: number;
  platform: string;
  campaign_id: string;
  campaign_name: string | null;
  signal: Signal;
  roas: number | null;
  cpa: number | null;
  ncpa: number | null;
  spend: number | null;
  revenue: number | null;
  computed_at: string;
}

export interface StoplightSummary {
  scale: number;
  watch: number;
  cut: number;
}

export interface StoplightFilter {
  platform?: string;
  signal?: Signal;
}

export interface DailySnapshot {
  date: string;
  total_spend: number;
  total_revenue: number;
  total_orders: number;
  new_orders: number;
  returning_orders: number;
  cogs: number;
  profit: number;
  roas: number | null;
  cpa: number | null;
  ncpa: number | null;
  mer: number | null;
  aov: number | null;
  profit_margin: number | null;
  is_profitable: boolean;
  is_promo_day: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Snapshot daily profit ────────────────────────────────────────

/**
 * Aggregate spend from all ad platforms and revenue from pixel_events_v2
 * Purchase events (or CC orders) for a given date, compute all metrics,
 * and upsert into daily_profit_snapshots.
 */
export async function snapshotDailyProfit(userId: number, date: string): Promise<void> {
  log.info({ userId, date }, 'Snapshotting daily profit');

  // 1. Total spend across all platforms (archive tables hold historical data)
  const spendResult = await pool.query(`
    SELECT COALESCE(fb.spend, 0) + COALESCE(tt.spend, 0) + COALESCE(nb.spend, 0) AS total_spend
    FROM (
      SELECT SUM((ad_data->>'spend')::NUMERIC) AS spend
      FROM fb_ads_archive
      WHERE user_id = $1 AND archived_date = $2::DATE
    ) fb,
    (
      SELECT SUM((ad_data->>'spend')::NUMERIC) AS spend
      FROM tiktok_ads_archive
      WHERE user_id = $1 AND archived_date = $2::DATE
    ) tt,
    (
      SELECT SUM((ad_data->>'spend')::NUMERIC) AS spend
      FROM newsbreak_ads_archive
      WHERE user_id = $1 AND archived_date = $2::DATE
    ) nb
  `, [userId, date]);
  const totalSpend = parseFloat(spendResult.rows[0]?.total_spend || '0');

  // 2. Revenue + orders from pixel_events_v2 Purchase events
  const revenueResult = await pool.query(`
    SELECT
      COALESCE(SUM(revenue), 0) AS total_revenue,
      COUNT(*) AS total_orders
    FROM pixel_events_v2
    WHERE user_id = $1
      AND event_name = 'Purchase'
      AND created_at::DATE = $2::DATE
  `, [userId, date]);
  let totalRevenue = parseFloat(revenueResult.rows[0]?.total_revenue || '0');
  let totalOrders = parseInt(revenueResult.rows[0]?.total_orders || '0', 10);

  // Fallback: if no pixel revenue, try CC orders
  if (totalRevenue === 0) {
    const ccResult = await pool.query(`
      SELECT
        COALESCE(SUM((order_data->>'revenue')::NUMERIC), 0) AS total_revenue,
        COUNT(*) AS total_orders
      FROM orders_archive
      WHERE user_id = $1
        AND archived_date = $2::DATE
    `, [userId, date]);
    totalRevenue = parseFloat(ccResult.rows[0]?.total_revenue || '0');
    totalOrders = parseInt(ccResult.rows[0]?.total_orders || '0', 10);
  }

  // 3. New vs returning orders (from pixel Purchase events with visitor info)
  const nrResult = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE v.total_revenue <= pe.revenue) AS new_orders,
      COUNT(*) FILTER (WHERE v.total_revenue > pe.revenue) AS returning_orders
    FROM pixel_events_v2 pe
    LEFT JOIN pixel_visitors v ON v.id = pe.visitor_id
    WHERE pe.user_id = $1
      AND pe.event_name = 'Purchase'
      AND pe.created_at::DATE = $2::DATE
  `, [userId, date]);
  const newOrders = parseInt(nrResult.rows[0]?.new_orders || '0', 10);
  const returningOrders = parseInt(nrResult.rows[0]?.returning_orders || '0', 10);

  // 4. COGS from settings (percentage of revenue or flat per-order)
  const cogsPercent = parseFloat((await getSetting('cogs_percent', userId)) || '0');
  const cogsPerOrder = parseFloat((await getSetting('cogs_per_order', userId)) || '0');
  const cogs = totalRevenue * (cogsPercent / 100) + totalOrders * cogsPerOrder;

  // 5. Compute metrics
  const profit = totalRevenue - totalSpend - cogs;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;
  const cpa = totalOrders > 0 ? totalSpend / totalOrders : null;
  const ncpa = newOrders > 0 ? totalSpend / newOrders : null;
  const mer = totalSpend > 0 ? totalRevenue / totalSpend : null;
  const aov = totalOrders > 0 ? totalRevenue / totalOrders : null;
  const profitMargin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : null;
  const isProfitable = profit > 0;

  // 6. Upsert into daily_profit_snapshots
  await pool.query(`
    INSERT INTO daily_profit_snapshots
      (user_id, date, total_spend, total_revenue, total_orders,
       new_orders, returning_orders, cogs, profit, roas, cpa, ncpa,
       mer, aov, profit_margin, is_profitable)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (user_id, date)
    DO UPDATE SET
      total_spend = EXCLUDED.total_spend,
      total_revenue = EXCLUDED.total_revenue,
      total_orders = EXCLUDED.total_orders,
      new_orders = EXCLUDED.new_orders,
      returning_orders = EXCLUDED.returning_orders,
      cogs = EXCLUDED.cogs,
      profit = EXCLUDED.profit,
      roas = EXCLUDED.roas,
      cpa = EXCLUDED.cpa,
      ncpa = EXCLUDED.ncpa,
      mer = EXCLUDED.mer,
      aov = EXCLUDED.aov,
      profit_margin = EXCLUDED.profit_margin,
      is_profitable = EXCLUDED.is_profitable
  `, [
    userId, date, totalSpend, totalRevenue, totalOrders,
    newOrders, returningOrders, cogs, profit, roas, cpa, ncpa,
    mer, aov, profitMargin, isProfitable,
  ]);

  log.info({ userId, date, totalSpend, totalRevenue, profit }, 'Daily profit snapshot saved');
}

// ── Compute benchmarks ───────────────────────────────────────────

/**
 * Looks at the last 180 days of daily_profit_snapshots for this user.
 * Takes the top 20 most profitable non-promo days.
 * Computes median ROAS, CPA, nCPA, MER, AOV, profit_margin from those days.
 * Sets green threshold at the median, amber at 80% of median.
 * Upserts into profit_benchmarks.
 */
export async function computeBenchmarks(userId: number): Promise<void> {
  log.info({ userId }, 'Computing benchmarks');

  // Fetch top 20 profitable, non-promo days in last 180 days
  const result = await pool.query(`
    SELECT roas, cpa, ncpa, mer, aov, profit_margin
    FROM daily_profit_snapshots
    WHERE user_id = $1
      AND is_profitable = true
      AND is_promo_day = false
      AND date >= CURRENT_DATE - INTERVAL '180 days'
    ORDER BY profit DESC
    LIMIT 20
  `, [userId]);

  if (result.rows.length === 0) {
    log.info({ userId }, 'No profitable days found — skipping benchmark computation');
    return;
  }

  const rows = result.rows;

  // Compute medians for each metric
  const metrics: Record<BenchmarkMetric, number[]> = {
    roas: [],
    cpa: [],
    ncpa: [],
    mer: [],
    aov: [],
    profit_margin: [],
  };

  for (const row of rows) {
    for (const m of ALL_METRICS) {
      if (row[m] != null) {
        metrics[m].push(parseFloat(row[m]));
      }
    }
  }

  for (const metric of ALL_METRICS) {
    const values = metrics[metric];
    if (values.length === 0) continue;

    const med = median(values);
    // For CPA and nCPA, lower is better — invert the threshold logic
    const isLowerBetter = metric === 'cpa' || metric === 'ncpa';
    const greenThreshold = isLowerBetter ? med : med;
    const amberThreshold = isLowerBetter ? med * 1.2 : med * 0.8;

    await pool.query(`
      INSERT INTO profit_benchmarks (user_id, metric, threshold_green, threshold_amber, auto_computed, last_computed)
      VALUES ($1, $2, $3, $4, true, NOW())
      ON CONFLICT (user_id, metric)
      DO UPDATE SET
        threshold_green = CASE WHEN profit_benchmarks.auto_computed THEN EXCLUDED.threshold_green ELSE profit_benchmarks.threshold_green END,
        threshold_amber = CASE WHEN profit_benchmarks.auto_computed THEN EXCLUDED.threshold_amber ELSE profit_benchmarks.threshold_amber END,
        last_computed = NOW(),
        updated_at = NOW()
    `, [userId, metric, greenThreshold, amberThreshold]);
  }

  log.info({ userId, days: rows.length }, 'Benchmarks computed');
}

// ── Campaign stoplights ──────────────────────────────────────────

/**
 * For each active campaign (from fb_ads_today, tiktok_ads_today, newsbreak_ads_today),
 * computes ROAS and CPA, compares against benchmarks, assigns signal.
 * Upserts into campaign_stoplights.
 */
export async function computeCampaignStoplights(userId: number): Promise<void> {
  log.info({ userId }, 'Computing campaign stoplights');

  // Load benchmarks
  const benchResult = await pool.query(
    'SELECT metric, threshold_green, threshold_amber FROM profit_benchmarks WHERE user_id = $1',
    [userId],
  );
  if (benchResult.rows.length === 0) {
    log.info({ userId }, 'No benchmarks found — skipping stoplight computation');
    return;
  }

  const benchmarks: Record<string, { green: number; amber: number }> = {};
  for (const row of benchResult.rows) {
    benchmarks[row.metric] = {
      green: parseFloat(row.threshold_green),
      amber: parseFloat(row.threshold_amber),
    };
  }

  // Aggregate campaign-level metrics from today tables
  const campaignQuery = `
    SELECT 'meta' AS platform, campaign_id, campaign_name,
           SUM(spend) AS spend,
           SUM(COALESCE(conversion_value, 0)) AS revenue,
           SUM(COALESCE(conversions, 0)) AS conversions
    FROM fb_ads_today
    WHERE user_id = $1 AND campaign_id IS NOT NULL
    GROUP BY campaign_id, campaign_name
    HAVING SUM(spend) > 0

    UNION ALL

    SELECT 'tiktok' AS platform, campaign_id, campaign_name,
           SUM(spend) AS spend,
           SUM(COALESCE(conversion_value, 0)) AS revenue,
           SUM(COALESCE(conversions, 0)) AS conversions
    FROM tiktok_ads_today
    WHERE user_id = $1 AND campaign_id IS NOT NULL
    GROUP BY campaign_id, campaign_name
    HAVING SUM(spend) > 0

    UNION ALL

    SELECT 'newsbreak' AS platform, campaign_id, campaign_name,
           SUM(spend) AS spend,
           SUM(COALESCE(conversion_value, 0)) AS revenue,
           SUM(COALESCE(conversions, 0)) AS conversions
    FROM newsbreak_ads_today
    WHERE user_id = $1 AND campaign_id IS NOT NULL
    GROUP BY campaign_id, campaign_name
    HAVING SUM(spend) > 0
  `;

  const campaigns = await pool.query(campaignQuery, [userId]);

  // Clear old stoplights for this user before re-computing
  await pool.query('DELETE FROM campaign_stoplights WHERE user_id = $1', [userId]);

  for (const row of campaigns.rows) {
    const spend = parseFloat(row.spend || '0');
    const revenue = parseFloat(row.revenue || '0');
    const conversions = parseInt(row.conversions || '0', 10);

    const roas = spend > 0 ? revenue / spend : null;
    const cpa = conversions > 0 ? spend / conversions : null;

    // Determine signal based on ROAS benchmark (primary) and CPA (secondary)
    let signal: Signal = 'watch';

    if (benchmarks.roas && roas != null) {
      if (roas >= benchmarks.roas.green) {
        signal = 'scale';
      } else if (roas >= benchmarks.roas.amber) {
        signal = 'watch';
      } else {
        signal = 'cut';
      }
    }

    // CPA check: for CPA, lower is better, so green <= threshold
    if (signal === 'scale' && benchmarks.cpa && cpa != null) {
      if (cpa > benchmarks.cpa.amber) {
        signal = 'watch'; // demote if CPA is too high
      }
    }

    await pool.query(`
      INSERT INTO campaign_stoplights
        (user_id, platform, campaign_id, campaign_name, signal, roas, cpa, ncpa, spend, revenue, computed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, NOW())
      ON CONFLICT (user_id, platform, campaign_id)
      DO UPDATE SET
        campaign_name = EXCLUDED.campaign_name,
        signal = EXCLUDED.signal,
        roas = EXCLUDED.roas,
        cpa = EXCLUDED.cpa,
        ncpa = EXCLUDED.ncpa,
        spend = EXCLUDED.spend,
        revenue = EXCLUDED.revenue,
        computed_at = NOW()
    `, [userId, row.platform, row.campaign_id, row.campaign_name, signal, roas, cpa, spend, revenue]);
  }

  log.info({ userId, campaigns: campaigns.rows.length }, 'Campaign stoplights computed');

  // Fire stoplight-triggered automation rules
  try {
    await evaluateStoplightRules(userId);
  } catch (err) {
    log.error({ userId, err }, 'Failed to evaluate stoplight rules');
  }
}

// ── Read operations ──────────────────────────────────────────────

export async function getBenchmarks(userId: number): Promise<Benchmark[]> {
  const result = await pool.query(
    `SELECT metric, threshold_green, threshold_amber, auto_computed, last_computed
     FROM profit_benchmarks
     WHERE user_id = $1
     ORDER BY metric`,
    [userId],
  );
  return result.rows.map(r => ({
    metric: r.metric,
    threshold_green: r.threshold_green ? parseFloat(r.threshold_green) : null,
    threshold_amber: r.threshold_amber ? parseFloat(r.threshold_amber) : null,
    auto_computed: r.auto_computed,
    last_computed: r.last_computed,
  }));
}

export async function getStoplights(userId: number, filter?: StoplightFilter): Promise<Stoplight[]> {
  let query = `
    SELECT id, platform, campaign_id, campaign_name, signal, roas, cpa, ncpa, spend, revenue, computed_at
    FROM campaign_stoplights
    WHERE user_id = $1
  `;
  const params: (number | string)[] = [userId];
  let idx = 2;

  if (filter?.platform) {
    query += ` AND platform = $${idx}`;
    params.push(filter.platform);
    idx++;
  }
  if (filter?.signal) {
    query += ` AND signal = $${idx}`;
    params.push(filter.signal);
    idx++;
  }

  query += ' ORDER BY spend DESC NULLS LAST';

  const result = await pool.query(query, params);
  return result.rows.map(r => ({
    id: r.id,
    platform: r.platform,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    signal: r.signal as Signal,
    roas: r.roas ? parseFloat(r.roas) : null,
    cpa: r.cpa ? parseFloat(r.cpa) : null,
    ncpa: r.ncpa ? parseFloat(r.ncpa) : null,
    spend: r.spend ? parseFloat(r.spend) : null,
    revenue: r.revenue ? parseFloat(r.revenue) : null,
    computed_at: r.computed_at,
  }));
}

export async function getStoplightSummary(userId: number): Promise<StoplightSummary> {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE signal = 'scale') AS scale,
      COUNT(*) FILTER (WHERE signal = 'watch') AS watch,
      COUNT(*) FILTER (WHERE signal = 'cut') AS cut
    FROM campaign_stoplights
    WHERE user_id = $1
  `, [userId]);

  const row = result.rows[0] || {};
  return {
    scale: parseInt(row.scale || '0', 10),
    watch: parseInt(row.watch || '0', 10),
    cut: parseInt(row.cut || '0', 10),
  };
}

export async function getDailySnapshots(
  userId: number,
  startDate?: string,
  endDate?: string,
): Promise<DailySnapshot[]> {
  let query = `
    SELECT date, total_spend, total_revenue, total_orders,
           new_orders, returning_orders, cogs, profit,
           roas, cpa, ncpa, mer, aov, profit_margin,
           is_profitable, is_promo_day
    FROM daily_profit_snapshots
    WHERE user_id = $1
  `;
  const params: (number | string)[] = [userId];
  let idx = 2;

  if (startDate) {
    query += ` AND date >= $${idx}::DATE`;
    params.push(startDate);
    idx++;
  }
  if (endDate) {
    query += ` AND date <= $${idx}::DATE`;
    params.push(endDate);
    idx++;
  }

  query += ' ORDER BY date DESC';

  const result = await pool.query(query, params);
  return result.rows.map(r => ({
    date: r.date,
    total_spend: parseFloat(r.total_spend),
    total_revenue: parseFloat(r.total_revenue),
    total_orders: parseInt(r.total_orders, 10),
    new_orders: parseInt(r.new_orders, 10),
    returning_orders: parseInt(r.returning_orders, 10),
    cogs: parseFloat(r.cogs),
    profit: parseFloat(r.profit),
    roas: r.roas ? parseFloat(r.roas) : null,
    cpa: r.cpa ? parseFloat(r.cpa) : null,
    ncpa: r.ncpa ? parseFloat(r.ncpa) : null,
    mer: r.mer ? parseFloat(r.mer) : null,
    aov: r.aov ? parseFloat(r.aov) : null,
    profit_margin: r.profit_margin ? parseFloat(r.profit_margin) : null,
    is_profitable: r.is_profitable,
    is_promo_day: r.is_promo_day,
  }));
}

// ── Manual override ──────────────────────────────────────────────

export async function updateBenchmark(
  userId: number,
  metric: BenchmarkMetric,
  greenThreshold: number,
  amberThreshold: number,
): Promise<Benchmark> {
  if (!ALL_METRICS.includes(metric)) {
    throw new Error(`Invalid metric: ${metric}`);
  }

  const result = await pool.query(`
    INSERT INTO profit_benchmarks (user_id, metric, threshold_green, threshold_amber, auto_computed, last_computed)
    VALUES ($1, $2, $3, $4, false, NOW())
    ON CONFLICT (user_id, metric)
    DO UPDATE SET
      threshold_green = $3,
      threshold_amber = $4,
      auto_computed = false,
      updated_at = NOW()
    RETURNING metric, threshold_green, threshold_amber, auto_computed, last_computed
  `, [userId, metric, greenThreshold, amberThreshold]);

  const r = result.rows[0];
  return {
    metric: r.metric,
    threshold_green: r.threshold_green ? parseFloat(r.threshold_green) : null,
    threshold_amber: r.threshold_amber ? parseFloat(r.threshold_amber) : null,
    auto_computed: r.auto_computed,
    last_computed: r.last_computed,
  };
}

// ── Batch operations for scheduler ───────────────────────────────

export async function snapshotDailyProfitForAllUsers(): Promise<{ usersProcessed: number }> {
  const result = await pool.query('SELECT DISTINCT id FROM users');
  const userIds: number[] = result.rows.map(r => r.id);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  let processed = 0;
  for (const userId of userIds) {
    try {
      await snapshotDailyProfit(userId, dateStr);
      processed++;
    } catch (err) {
      log.error({ userId, date: dateStr, err }, 'Failed to snapshot daily profit');
    }
  }

  return { usersProcessed: processed };
}

export async function computeBenchmarksForAllUsers(): Promise<{ usersProcessed: number }> {
  const result = await pool.query('SELECT DISTINCT id FROM users');
  const userIds: number[] = result.rows.map(r => r.id);

  let processed = 0;
  for (const userId of userIds) {
    try {
      await computeBenchmarks(userId);
      await computeCampaignStoplights(userId);
      processed++;
    } catch (err) {
      log.error({ userId, err }, 'Failed to compute benchmarks/stoplights');
    }
  }

  return { usersProcessed: processed };
}
