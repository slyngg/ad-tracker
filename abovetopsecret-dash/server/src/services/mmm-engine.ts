import pool from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('MMM');

// ─── Types ───────────────────────────────────────────────────────────────────
interface ChannelDailyData {
  date: string;
  spend: number;
  revenue: number;
}

interface HillParams {
  alpha: number;
  beta: number;
  gamma: number;
}

interface FittedChannel {
  channel: string;
  alpha: number;
  beta: number;
  gamma: number;
  rSquared: number;
  dataPoints: number;
}

interface ResponseCurvePoint {
  spend: number;
  predicted_revenue: number;
}

interface ChannelEfficiency {
  channel: string;
  currentSpend: number;
  predictedRevenue: number;
  marginalRoas: number;
  headroom: string; // 'high' | 'medium' | 'low'
}

interface BudgetAllocation {
  channel: string;
  spend: number;
  predicted_revenue: number;
}

// ─── Hill Function ───────────────────────────────────────────────────────────
// f(x) = alpha * (x^beta) / (x^beta + gamma^beta)
function hillFunction(spend: number, params: HillParams): number {
  if (spend <= 0) return 0;
  const spendBeta = Math.pow(spend, params.beta);
  const gammaBeta = Math.pow(params.gamma, params.beta);
  return params.alpha * spendBeta / (spendBeta + gammaBeta);
}

// Derivative of Hill function wrt spend (for marginal ROAS):
// d/dx [ alpha * x^beta / (x^beta + gamma^beta) ]
// = alpha * beta * x^(beta-1) * gamma^beta / (x^beta + gamma^beta)^2
function hillDerivative(spend: number, params: HillParams): number {
  if (spend <= 0) return 0;
  const spendBeta = Math.pow(spend, params.beta);
  const gammaBeta = Math.pow(params.gamma, params.beta);
  const denom = (spendBeta + gammaBeta);
  return params.alpha * params.beta * Math.pow(spend, params.beta - 1) * gammaBeta / (denom * denom);
}

// ─── Data Fetching ───────────────────────────────────────────────────────────
// For each channel, get daily spend from the ad archives. For revenue, we
// use the total revenue from orders_archive for that day. Then we attribute
// revenue proportionally to each channel by its spend share.

const CHANNELS = ['meta', 'tiktok', 'newsbreak'] as const;
type Channel = typeof CHANNELS[number];

async function getDailyChannelData(userId: number, channel: Channel, days = 90): Promise<ChannelDailyData[]> {
  // Get per-channel daily spend
  let spendQuery: string;
  switch (channel) {
    case 'meta':
      spendQuery = `
        SELECT archived_date AS date,
               COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend
        FROM fb_ads_archive
        WHERE user_id = $1 AND archived_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
        GROUP BY archived_date
        ORDER BY archived_date
      `;
      break;
    case 'tiktok':
      spendQuery = `
        SELECT archived_date AS date,
               COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend
        FROM tiktok_ads_archive
        WHERE user_id = $1 AND archived_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
        GROUP BY archived_date
        ORDER BY archived_date
      `;
      break;
    case 'newsbreak':
      spendQuery = `
        SELECT archived_date AS date,
               COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend
        FROM newsbreak_ads_archive
        WHERE user_id = $1 AND archived_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
        GROUP BY archived_date
        ORDER BY archived_date
      `;
      break;
  }

  const spendResult = await pool.query(spendQuery, [userId, days]);

  // Get total spend per day across all channels for proportional revenue attribution
  const totalSpendResult = await pool.query(`
    SELECT date, SUM(spend) AS total_spend FROM (
      SELECT archived_date AS date, COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend
      FROM fb_ads_archive WHERE user_id = $1 AND archived_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      GROUP BY archived_date
      UNION ALL
      SELECT archived_date AS date, COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend
      FROM tiktok_ads_archive WHERE user_id = $1 AND archived_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      GROUP BY archived_date
      UNION ALL
      SELECT archived_date AS date, COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend
      FROM newsbreak_ads_archive WHERE user_id = $1 AND archived_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      GROUP BY archived_date
    ) all_spend GROUP BY date
  `, [userId, days]);

  const totalSpendByDate = new Map<string, number>();
  for (const row of totalSpendResult.rows) {
    totalSpendByDate.set(String(row.date).split('T')[0], parseFloat(row.total_spend) || 0);
  }

  // Get daily revenue from orders archive + platform conversion values
  const revenueResult = await pool.query(`
    SELECT date, GREATEST(COALESCE(order_rev, 0), COALESCE(platform_rev, 0)) AS revenue
    FROM (
      SELECT archived_date AS date,
             SUM(CASE WHEN order_data->>'order_status' = 'completed'
               AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
               THEN COALESCE((order_data->>'subtotal')::NUMERIC, (order_data->>'revenue')::NUMERIC) ELSE 0 END) AS order_rev
      FROM orders_archive
      WHERE user_id = $1 AND archived_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
      GROUP BY archived_date
    ) o
    FULL OUTER JOIN (
      SELECT date, SUM(platform_rev) AS platform_rev FROM (
        SELECT archived_date AS date, COALESCE(SUM((ad_data->>'conversion_value')::NUMERIC), 0) AS platform_rev
        FROM tiktok_ads_archive WHERE user_id = $1 AND archived_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
        GROUP BY archived_date
        UNION ALL
        SELECT archived_date AS date, COALESCE(SUM((ad_data->>'conversion_value')::NUMERIC), 0) AS platform_rev
        FROM newsbreak_ads_archive WHERE user_id = $1 AND archived_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
        GROUP BY archived_date
      ) pr GROUP BY date
    ) p USING (date)
  `, [userId, days]);

  const revenueByDate = new Map<string, number>();
  for (const row of revenueResult.rows) {
    revenueByDate.set(String(row.date).split('T')[0], parseFloat(row.revenue) || 0);
  }

  // Attribute revenue proportionally by spend share
  const data: ChannelDailyData[] = [];
  for (const row of spendResult.rows) {
    const dateStr = String(row.date).split('T')[0];
    const channelSpend = parseFloat(row.spend) || 0;
    if (channelSpend <= 0) continue;

    const totalSpend = totalSpendByDate.get(dateStr) || 0;
    const totalRevenue = revenueByDate.get(dateStr) || 0;
    const spendShare = totalSpend > 0 ? channelSpend / totalSpend : 0;
    const attributedRevenue = totalRevenue * spendShare;

    data.push({
      date: dateStr,
      spend: channelSpend,
      revenue: attributedRevenue,
    });
  }

  return data;
}

// ─── Curve Fitting (Grid Search) ─────────────────────────────────────────────
function computeSSR(data: ChannelDailyData[], params: HillParams): number {
  let ssr = 0;
  for (const point of data) {
    const predicted = hillFunction(point.spend, params);
    const residual = point.revenue - predicted;
    ssr += residual * residual;
  }
  return ssr;
}

function computeRSquared(data: ChannelDailyData[], params: HillParams): number {
  if (data.length < 2) return 0;
  const meanRevenue = data.reduce((s, d) => s + d.revenue, 0) / data.length;
  let ssTot = 0;
  let ssRes = 0;
  for (const point of data) {
    ssTot += (point.revenue - meanRevenue) ** 2;
    const predicted = hillFunction(point.spend, params);
    ssRes += (point.revenue - predicted) ** 2;
  }
  if (ssTot === 0) return 0;
  return 1 - ssRes / ssTot;
}

function fitCurve(data: ChannelDailyData[]): HillParams & { rSquared: number } {
  if (data.length < 3) {
    return { alpha: 1, beta: 1, gamma: 1000, rSquared: 0 };
  }

  const maxRevenue = Math.max(...data.map(d => d.revenue));
  const maxSpend = Math.max(...data.map(d => d.spend));

  // Phase 1: Coarse grid search
  // alpha: scale of max revenue output. Range from 0.5x to 10x max observed revenue
  const alphaMin = Math.max(0.5, maxRevenue * 0.5);
  const alphaMax = Math.max(10, maxRevenue * 10);
  const alphaSteps = 15;

  const betaValues = [0.3, 0.5, 0.7, 0.9, 1.0, 1.2, 1.5, 1.8, 2.0];

  // gamma: half-saturation point. Range from small to well beyond max spend
  const gammaMin = Math.max(100, maxSpend * 0.1);
  const gammaMax = Math.max(10000, maxSpend * 5);
  const gammaSteps = 15;

  let bestParams: HillParams = { alpha: 1, beta: 1, gamma: 1000 };
  let bestSSR = Infinity;

  for (let ai = 0; ai < alphaSteps; ai++) {
    const alpha = alphaMin + (alphaMax - alphaMin) * ai / (alphaSteps - 1);
    for (const beta of betaValues) {
      for (let gi = 0; gi < gammaSteps; gi++) {
        const gamma = gammaMin + (gammaMax - gammaMin) * gi / (gammaSteps - 1);
        const params = { alpha, beta, gamma };
        const ssr = computeSSR(data, params);
        if (ssr < bestSSR) {
          bestSSR = ssr;
          bestParams = params;
        }
      }
    }
  }

  // Phase 2: Refinement around best point
  const refineAlphaMin = Math.max(0.1, bestParams.alpha * 0.7);
  const refineAlphaMax = bestParams.alpha * 1.3;
  const refineBetaMin = Math.max(0.1, bestParams.beta - 0.3);
  const refineBetaMax = Math.min(3.0, bestParams.beta + 0.3);
  const refineGammaMin = Math.max(10, bestParams.gamma * 0.5);
  const refineGammaMax = bestParams.gamma * 2;

  const refineSteps = 12;

  for (let ai = 0; ai < refineSteps; ai++) {
    const alpha = refineAlphaMin + (refineAlphaMax - refineAlphaMin) * ai / (refineSteps - 1);
    for (let bi = 0; bi < refineSteps; bi++) {
      const beta = refineBetaMin + (refineBetaMax - refineBetaMin) * bi / (refineSteps - 1);
      for (let gi = 0; gi < refineSteps; gi++) {
        const gamma = refineGammaMin + (refineGammaMax - refineGammaMin) * gi / (refineSteps - 1);
        const params = { alpha, beta, gamma };
        const ssr = computeSSR(data, params);
        if (ssr < bestSSR) {
          bestSSR = ssr;
          bestParams = params;
        }
      }
    }
  }

  const rSquared = computeRSquared(data, bestParams);
  return { ...bestParams, rSquared };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Fit Hill response curves for each channel for the user */
export async function fitChannelCurves(userId: number): Promise<FittedChannel[]> {
  const results: FittedChannel[] = [];

  for (const channel of CHANNELS) {
    try {
      const data = await getDailyChannelData(userId, channel, 90);

      if (data.length < 5) {
        log.info({ userId, channel, dataPoints: data.length }, 'Insufficient data for curve fitting');
        continue;
      }

      const fitted = fitCurve(data);
      log.info({ userId, channel, ...fitted, dataPoints: data.length }, 'Fitted response curve');

      // Upsert into mmm_channel_params
      await pool.query(`
        INSERT INTO mmm_channel_params (user_id, channel, alpha, beta, gamma, r_squared, data_points, last_fitted, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (user_id, channel) DO UPDATE SET
          alpha = $3, beta = $4, gamma = $5, r_squared = $6, data_points = $7,
          last_fitted = NOW(), updated_at = NOW()
      `, [userId, channel, fitted.alpha, fitted.beta, fitted.gamma, fitted.rSquared, data.length]);

      results.push({
        channel,
        alpha: fitted.alpha,
        beta: fitted.beta,
        gamma: fitted.gamma,
        rSquared: fitted.rSquared,
        dataPoints: data.length,
      });
    } catch (err) {
      log.error({ userId, channel, err }, 'Failed to fit curve');
    }
  }

  return results;
}

/** Predict revenue for a given spend on a channel */
export async function predictRevenue(userId: number, channel: string, spend: number): Promise<number> {
  const result = await pool.query(
    'SELECT alpha, beta, gamma FROM mmm_channel_params WHERE user_id = $1 AND channel = $2',
    [userId, channel]
  );
  if (result.rows.length === 0) return 0;

  const { alpha, beta, gamma } = result.rows[0];
  return hillFunction(spend, {
    alpha: parseFloat(alpha),
    beta: parseFloat(beta),
    gamma: parseFloat(gamma),
  });
}

/** Get response curve points for plotting */
export async function getResponseCurve(
  userId: number,
  channel: string,
  minSpend: number,
  maxSpend: number,
  steps: number
): Promise<ResponseCurvePoint[]> {
  const result = await pool.query(
    'SELECT alpha, beta, gamma FROM mmm_channel_params WHERE user_id = $1 AND channel = $2',
    [userId, channel]
  );
  if (result.rows.length === 0) return [];

  const params: HillParams = {
    alpha: parseFloat(result.rows[0].alpha),
    beta: parseFloat(result.rows[0].beta),
    gamma: parseFloat(result.rows[0].gamma),
  };

  const points: ResponseCurvePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const spend = minSpend + (maxSpend - minSpend) * i / steps;
    points.push({
      spend: Math.round(spend * 100) / 100,
      predicted_revenue: Math.round(hillFunction(spend, params) * 100) / 100,
    });
  }
  return points;
}

/** Optimize budget allocation across channels to maximize total predicted revenue */
export async function optimizeBudget(userId: number, totalBudget: number): Promise<BudgetAllocation[]> {
  const paramsResult = await pool.query(
    'SELECT channel, alpha, beta, gamma FROM mmm_channel_params WHERE user_id = $1',
    [userId]
  );
  if (paramsResult.rows.length === 0) return [];

  const channelParams: Map<string, HillParams> = new Map();
  for (const row of paramsResult.rows) {
    channelParams.set(row.channel, {
      alpha: parseFloat(row.alpha),
      beta: parseFloat(row.beta),
      gamma: parseFloat(row.gamma),
    });
  }

  const channels = Array.from(channelParams.keys());
  if (channels.length === 0) return [];

  // Start with equal split
  const allocation = new Map<string, number>();
  const equalSplit = totalBudget / channels.length;
  for (const ch of channels) {
    allocation.set(ch, equalSplit);
  }

  // Iterative optimization: shift $100 increments from lowest marginal return to highest
  const increment = Math.max(50, totalBudget * 0.01); // 1% of budget or $50, whichever is larger
  const maxIterations = 500;

  for (let iter = 0; iter < maxIterations; iter++) {
    // Compute marginal ROAS for each channel at current spend
    let lowestMarginal = Infinity;
    let lowestChannel = '';
    let highestMarginal = -Infinity;
    let highestChannel = '';

    for (const ch of channels) {
      const params = channelParams.get(ch)!;
      const spend = allocation.get(ch)!;
      const marginal = hillDerivative(spend, params);

      if (marginal < lowestMarginal && spend > increment) {
        lowestMarginal = marginal;
        lowestChannel = ch;
      }
      if (marginal > highestMarginal) {
        highestMarginal = marginal;
        highestChannel = ch;
      }
    }

    // If same channel or marginals are very close, we've converged
    if (lowestChannel === highestChannel || !lowestChannel || !highestChannel) break;
    if (highestMarginal - lowestMarginal < 0.001) break;

    // Shift increment from lowest to highest
    allocation.set(lowestChannel, allocation.get(lowestChannel)! - increment);
    allocation.set(highestChannel, allocation.get(highestChannel)! + increment);
  }

  // Build result with predicted revenue
  const result: BudgetAllocation[] = [];
  for (const ch of channels) {
    const spend = allocation.get(ch)!;
    const params = channelParams.get(ch)!;
    result.push({
      channel: ch,
      spend: Math.round(spend * 100) / 100,
      predicted_revenue: Math.round(hillFunction(spend, params) * 100) / 100,
    });
  }

  return result;
}

/** Simulate a custom budget allocation scenario */
export async function simulateScenario(
  userId: number,
  allocations: { channel: string; spend: number }[]
): Promise<{ allocations: BudgetAllocation[]; totalRevenue: number; totalSpend: number; roas: number }> {
  const paramsResult = await pool.query(
    'SELECT channel, alpha, beta, gamma FROM mmm_channel_params WHERE user_id = $1',
    [userId]
  );

  const channelParams = new Map<string, HillParams>();
  for (const row of paramsResult.rows) {
    channelParams.set(row.channel, {
      alpha: parseFloat(row.alpha),
      beta: parseFloat(row.beta),
      gamma: parseFloat(row.gamma),
    });
  }

  const results: BudgetAllocation[] = [];
  let totalRevenue = 0;
  let totalSpend = 0;

  for (const alloc of allocations) {
    const params = channelParams.get(alloc.channel);
    const predicted = params ? hillFunction(alloc.spend, params) : 0;
    results.push({
      channel: alloc.channel,
      spend: alloc.spend,
      predicted_revenue: Math.round(predicted * 100) / 100,
    });
    totalRevenue += predicted;
    totalSpend += alloc.spend;
  }

  return {
    allocations: results,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalSpend: Math.round(totalSpend * 100) / 100,
    roas: totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 10000) / 10000 : 0,
  };
}

/** Get channel efficiency metrics for all fitted channels */
export async function getChannelEfficiency(userId: number): Promise<ChannelEfficiency[]> {
  const paramsResult = await pool.query(
    'SELECT channel, alpha, beta, gamma, r_squared, data_points, last_fitted FROM mmm_channel_params WHERE user_id = $1',
    [userId]
  );

  if (paramsResult.rows.length === 0) return [];

  // Get current daily average spend per channel (last 7 days)
  const currentSpendResult = await pool.query(`
    SELECT channel, AVG(daily_spend) AS avg_spend FROM (
      SELECT 'meta' AS channel, archived_date, COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS daily_spend
      FROM fb_ads_archive WHERE user_id = $1 AND archived_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY archived_date
      UNION ALL
      SELECT 'tiktok', archived_date, COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0)
      FROM tiktok_ads_archive WHERE user_id = $1 AND archived_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY archived_date
      UNION ALL
      SELECT 'newsbreak', archived_date, COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0)
      FROM newsbreak_ads_archive WHERE user_id = $1 AND archived_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY archived_date
    ) daily GROUP BY channel
  `, [userId]);

  const currentSpend = new Map<string, number>();
  for (const row of currentSpendResult.rows) {
    currentSpend.set(row.channel, parseFloat(row.avg_spend) || 0);
  }

  const results: ChannelEfficiency[] = [];
  for (const row of paramsResult.rows) {
    const params: HillParams = {
      alpha: parseFloat(row.alpha),
      beta: parseFloat(row.beta),
      gamma: parseFloat(row.gamma),
    };
    const spend = currentSpend.get(row.channel) || 0;
    const predicted = hillFunction(spend, params);
    const marginal = hillDerivative(spend, params);

    // Headroom: compare current spend to gamma (half-saturation point)
    // If spend < gamma * 0.5 => high headroom
    // If spend < gamma * 1.5 => medium headroom
    // Else => low headroom (deep into diminishing returns)
    let headroom: 'high' | 'medium' | 'low';
    if (spend < params.gamma * 0.5) {
      headroom = 'high';
    } else if (spend < params.gamma * 1.5) {
      headroom = 'medium';
    } else {
      headroom = 'low';
    }

    results.push({
      channel: row.channel,
      currentSpend: Math.round(spend * 100) / 100,
      predictedRevenue: Math.round(predicted * 100) / 100,
      marginalRoas: Math.round(marginal * 10000) / 10000,
      headroom,
    });
  }

  return results;
}

/** Fit curves for all active users (scheduler entry point) */
export async function fitAllUserCurves(): Promise<{ usersProcessed: number; totalChannels: number }> {
  const userResult = await pool.query('SELECT DISTINCT id FROM users');
  let totalChannels = 0;

  for (const row of userResult.rows) {
    try {
      const fitted = await fitChannelCurves(row.id);
      totalChannels += fitted.length;
    } catch (err) {
      log.error({ userId: row.id, err }, 'Failed to fit curves for user');
    }
  }

  return { usersProcessed: userResult.rows.length, totalChannels };
}
