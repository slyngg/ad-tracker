import pool from '../db';

// ── Types ───────────────────────────────────────────────────────

export interface MetricDefinition {
  key: string;
  label: string;
  description: string;
  category: string;
  format: 'currency' | 'number' | 'ratio' | 'percentage';
}

export interface CorrelationPoint {
  date: string;
  x: number;
  y: number;
}

export type CorrelationStrength =
  | 'strong_positive'
  | 'moderate_positive'
  | 'weak_positive'
  | 'none'
  | 'weak_negative'
  | 'moderate_negative'
  | 'strong_negative';

export interface CorrelationResult {
  points: CorrelationPoint[];
  pearsonR: number;
  pValue: number;
  slope: number;
  intercept: number;
  interpretation: CorrelationStrength;
  interpretationText: string;
}

// ── Available Metrics ───────────────────────────────────────────

const METRICS: MetricDefinition[] = [
  { key: 'meta_spend', label: 'Meta Spend', description: 'Total Meta (Facebook/Instagram) ad spend', category: 'Spend', format: 'currency' },
  { key: 'tiktok_spend', label: 'TikTok Spend', description: 'Total TikTok ad spend', category: 'Spend', format: 'currency' },
  { key: 'google_spend', label: 'Google Spend', description: 'Total Google ad spend', category: 'Spend', format: 'currency' },
  { key: 'total_spend', label: 'Total Spend', description: 'Combined ad spend across all platforms', category: 'Spend', format: 'currency' },
  { key: 'total_revenue', label: 'Total Revenue', description: 'Total revenue from all orders', category: 'Revenue', format: 'currency' },
  { key: 'new_revenue', label: 'New Customer Revenue', description: 'Revenue from new customers', category: 'Revenue', format: 'currency' },
  { key: 'returning_revenue', label: 'Returning Customer Revenue', description: 'Revenue from returning customers', category: 'Revenue', format: 'currency' },
  { key: 'total_orders', label: 'Total Orders', description: 'Total number of completed orders', category: 'Orders', format: 'number' },
  { key: 'new_orders', label: 'New Orders', description: 'Orders from new customers', category: 'Orders', format: 'number' },
  { key: 'total_roas', label: 'Total ROAS', description: 'Return on ad spend (revenue / spend)', category: 'Efficiency', format: 'ratio' },
  { key: 'meta_roas', label: 'Meta ROAS', description: 'ROAS for Meta ads', category: 'Efficiency', format: 'ratio' },
  { key: 'tiktok_roas', label: 'TikTok ROAS', description: 'ROAS for TikTok ads', category: 'Efficiency', format: 'ratio' },
  { key: 'cpa', label: 'CPA', description: 'Cost per acquisition (spend / orders)', category: 'Efficiency', format: 'currency' },
  { key: 'ncpa', label: 'nCPA', description: 'New customer acquisition cost', category: 'Efficiency', format: 'currency' },
  { key: 'aov', label: 'AOV', description: 'Average order value', category: 'Orders', format: 'currency' },
  { key: 'pixel_sessions', label: 'Sessions', description: 'Total pixel-tracked sessions', category: 'Traffic', format: 'number' },
  { key: 'pixel_visitors', label: 'Visitors', description: 'Unique pixel-tracked visitors', category: 'Traffic', format: 'number' },
  { key: 'pixel_page_views', label: 'Page Views', description: 'Total pixel-tracked page views', category: 'Traffic', format: 'number' },
];

export function getAvailableMetrics(): MetricDefinition[] {
  return METRICS;
}

// ── Pure Math ───────────────────────────────────────────────────

export function calculatePearson(xValues: number[], yValues: number[]): number {
  const n = xValues.length;
  if (n < 3) return 0;

  const sumX = xValues.reduce((s, v) => s + v, 0);
  const sumY = yValues.reduce((s, v) => s + v, 0);
  const sumXY = xValues.reduce((s, v, i) => s + v * yValues[i], 0);
  const sumX2 = xValues.reduce((s, v) => s + v * v, 0);
  const sumY2 = yValues.reduce((s, v) => s + v * v, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
  );

  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function calculateLinearRegression(
  xValues: number[],
  yValues: number[],
): { slope: number; intercept: number } {
  const n = xValues.length;
  if (n < 2) return { slope: 0, intercept: 0 };

  const sumX = xValues.reduce((s, v) => s + v, 0);
  const sumY = yValues.reduce((s, v) => s + v, 0);
  const sumXY = xValues.reduce((s, v, i) => s + v * yValues[i], 0);
  const sumX2 = xValues.reduce((s, v) => s + v * v, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

/**
 * Approximate p-value from t-statistic using the t-distribution.
 * Uses a rational approximation for the incomplete beta function.
 */
function approximatePValue(r: number, n: number): number {
  if (n <= 2) return 1;
  const df = n - 2;
  const t = Math.abs(r) * Math.sqrt(df / (1 - r * r + 1e-15));

  // Approximation using the relationship between t-distribution and beta function
  // For large df, use normal approximation
  if (df > 100) {
    // Normal approximation for large degrees of freedom
    const z = t * (1 - 1 / (4 * df)) / Math.sqrt(1 + t * t / (2 * df));
    return 2 * (1 - normalCDF(z));
  }

  // Use regularized incomplete beta function approximation
  const x = df / (df + t * t);
  const p = incompleteBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

/** Standard normal CDF approximation */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

/** Regularized incomplete beta function approximation using continued fraction */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use the series expansion for better accuracy
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(
    Math.log(x) * a + Math.log(1 - x) * b - lnBeta,
  );

  // Lentz's continued fraction algorithm
  const maxIter = 200;
  const eps = 1e-14;
  let f = 1;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  f = d;

  for (let i = 1; i <= maxIter; i++) {
    const m = i;
    // Even step
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + num / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    f *= c * d;

    // Odd step
    num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + num / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    const delta = c * d;
    f *= delta;

    if (Math.abs(delta - 1) < eps) break;
  }

  return front * f / a;
}

/** Log gamma function (Stirling's approximation) */
function lnGamma(x: number): number {
  if (x <= 0) return 0;
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }

  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) {
    a += c[i] / (x + i);
  }

  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function classifyCorrelation(r: number): CorrelationStrength {
  const absR = Math.abs(r);
  if (absR >= 0.7) return r > 0 ? 'strong_positive' : 'strong_negative';
  if (absR >= 0.4) return r > 0 ? 'moderate_positive' : 'moderate_negative';
  if (absR >= 0.2) return r > 0 ? 'weak_positive' : 'weak_negative';
  return 'none';
}

function strengthLabel(strength: CorrelationStrength): string {
  const map: Record<CorrelationStrength, string> = {
    strong_positive: 'strong positive',
    moderate_positive: 'moderate positive',
    weak_positive: 'weak positive',
    none: 'no significant',
    weak_negative: 'weak negative',
    moderate_negative: 'moderate negative',
    strong_negative: 'strong negative',
  };
  return map[strength];
}

function getMetricLabel(key: string): string {
  return METRICS.find((m) => m.key === key)?.label ?? key;
}

function getMetricFormat(key: string): MetricDefinition['format'] {
  return METRICS.find((m) => m.key === key)?.format ?? 'number';
}

function formatMetricValue(value: number, format: MetricDefinition['format']): string {
  switch (format) {
    case 'currency':
      return `$${Math.abs(value).toFixed(2)}`;
    case 'ratio':
      return `${value.toFixed(2)}x`;
    case 'percentage':
      return `${value.toFixed(1)}%`;
    default:
      return Math.round(value).toLocaleString();
  }
}

function generateInterpretation(
  metricX: string,
  metricY: string,
  r: number,
  slope: number,
  strength: CorrelationStrength,
  points: CorrelationPoint[],
): string {
  const xLabel = getMetricLabel(metricX);
  const yLabel = getMetricLabel(metricY);
  const xFormat = getMetricFormat(metricX);
  const yFormat = getMetricFormat(metricY);

  const parts: string[] = [];

  // Headline correlation description
  parts.push(
    `${xLabel} and ${yLabel} show a ${strengthLabel(strength)} correlation (r=${r.toFixed(2)}).`,
  );

  // Slope interpretation (only if meaningful correlation)
  if (Math.abs(r) >= 0.3 && slope !== 0) {
    // Pick a sensible unit increment for the X metric
    const xValues = points.map((p) => p.x);
    const xRange = Math.max(...xValues) - Math.min(...xValues);
    let increment = 100;
    if (xFormat === 'number') increment = Math.max(1, Math.round(xRange / 10));
    if (xFormat === 'ratio') increment = 0.5;
    if (xFormat === 'percentage') increment = 10;

    const yDelta = slope * increment;
    const direction = yDelta > 0 ? 'increase' : 'decrease';
    parts.push(
      `Every ${formatMetricValue(increment, xFormat)} increase in ${xLabel} correlates with approximately ${formatMetricValue(Math.abs(yDelta), yFormat)} ${direction} in ${yLabel}.`,
    );
  }

  // Diminishing returns detection (for spend vs revenue)
  if (
    (metricX.includes('spend') && metricY.includes('revenue')) ||
    (metricX.includes('spend') && metricY.includes('roas'))
  ) {
    if (points.length >= 10) {
      const sorted = [...points].sort((a, b) => a.x - b.x);
      const mid = Math.floor(sorted.length / 2);
      const lowerHalf = sorted.slice(0, mid);
      const upperHalf = sorted.slice(mid);

      if (lowerHalf.length >= 3 && upperHalf.length >= 3) {
        const lowerSlope = calculateLinearRegression(
          lowerHalf.map((p) => p.x),
          lowerHalf.map((p) => p.y),
        ).slope;
        const upperSlope = calculateLinearRegression(
          upperHalf.map((p) => p.x),
          upperHalf.map((p) => p.y),
        ).slope;

        if (lowerSlope > 0 && upperSlope < lowerSlope * 0.5) {
          const threshold = sorted[mid].x;
          parts.push(
            `Diminishing returns appear to begin above ${formatMetricValue(threshold, xFormat)}/day based on the scatter pattern.`,
          );
        }
      }
    }
  }

  // Insufficient data warning
  if (points.length < 7) {
    parts.push(
      `Note: Only ${points.length} data point${points.length === 1 ? '' : 's'} available. Expand the date range for a more reliable analysis.`,
    );
  }

  return parts.join(' ');
}

// ── Data Fetching ───────────────────────────────────────────────

type Granularity = 'day' | 'week';

/**
 * Build SQL expression for a given metric key.
 * Returns an object with the SQL snippet and which CTEs it depends on.
 */
function metricSQL(key: string): { expr: string; needs: Set<string> } {
  const needs = new Set<string>();
  let expr = '0';

  switch (key) {
    case 'meta_spend':
      needs.add('meta');
      expr = 'COALESCE(meta.spend, 0)';
      break;
    case 'tiktok_spend':
      needs.add('tiktok');
      expr = 'COALESCE(tiktok.spend, 0)';
      break;
    case 'google_spend':
      // No google_ads_archive table exists yet; return 0
      expr = '0';
      break;
    case 'total_spend':
      needs.add('meta');
      needs.add('tiktok');
      needs.add('newsbreak');
      expr = 'COALESCE(meta.spend, 0) + COALESCE(tiktok.spend, 0) + COALESCE(newsbreak.spend, 0)';
      break;
    case 'total_revenue':
      needs.add('orders');
      needs.add('meta');
      needs.add('tiktok');
      needs.add('newsbreak');
      expr = `GREATEST(
        COALESCE(orders.revenue, 0),
        COALESCE(meta.conversion_value, 0) + COALESCE(tiktok.conversion_value, 0) + COALESCE(newsbreak.conversion_value, 0)
      )`;
      break;
    case 'new_revenue':
      needs.add('orders');
      expr = 'COALESCE(orders.new_revenue, 0)';
      break;
    case 'returning_revenue':
      needs.add('orders');
      expr = 'COALESCE(orders.revenue, 0) - COALESCE(orders.new_revenue, 0)';
      break;
    case 'total_orders':
      needs.add('orders');
      needs.add('meta');
      needs.add('tiktok');
      needs.add('newsbreak');
      expr = `GREATEST(
        COALESCE(orders.conversions, 0),
        COALESCE(meta.conversions, 0) + COALESCE(tiktok.conversions, 0) + COALESCE(newsbreak.conversions, 0)
      )`;
      break;
    case 'new_orders':
      needs.add('orders');
      expr = 'COALESCE(orders.new_conversions, 0)';
      break;
    case 'total_roas':
      needs.add('meta');
      needs.add('tiktok');
      needs.add('newsbreak');
      needs.add('orders');
      expr = `CASE WHEN (COALESCE(meta.spend, 0) + COALESCE(tiktok.spend, 0) + COALESCE(newsbreak.spend, 0)) > 0
        THEN GREATEST(
          COALESCE(orders.revenue, 0),
          COALESCE(meta.conversion_value, 0) + COALESCE(tiktok.conversion_value, 0) + COALESCE(newsbreak.conversion_value, 0)
        ) / (COALESCE(meta.spend, 0) + COALESCE(tiktok.spend, 0) + COALESCE(newsbreak.spend, 0))
        ELSE 0 END`;
      break;
    case 'meta_roas':
      needs.add('meta');
      needs.add('orders');
      expr = `CASE WHEN COALESCE(meta.spend, 0) > 0
        THEN GREATEST(COALESCE(orders.revenue, 0), COALESCE(meta.conversion_value, 0)) / meta.spend
        ELSE 0 END`;
      break;
    case 'tiktok_roas':
      needs.add('tiktok');
      expr = `CASE WHEN COALESCE(tiktok.spend, 0) > 0
        THEN COALESCE(tiktok.conversion_value, 0) / tiktok.spend
        ELSE 0 END`;
      break;
    case 'cpa':
      needs.add('meta');
      needs.add('tiktok');
      needs.add('newsbreak');
      needs.add('orders');
      expr = `CASE WHEN GREATEST(
          COALESCE(orders.conversions, 0),
          COALESCE(meta.conversions, 0) + COALESCE(tiktok.conversions, 0) + COALESCE(newsbreak.conversions, 0)
        ) > 0
        THEN (COALESCE(meta.spend, 0) + COALESCE(tiktok.spend, 0) + COALESCE(newsbreak.spend, 0)) /
          GREATEST(
            COALESCE(orders.conversions, 0),
            COALESCE(meta.conversions, 0) + COALESCE(tiktok.conversions, 0) + COALESCE(newsbreak.conversions, 0)
          )
        ELSE 0 END`;
      break;
    case 'ncpa':
      needs.add('meta');
      needs.add('tiktok');
      needs.add('newsbreak');
      needs.add('orders');
      expr = `CASE WHEN COALESCE(orders.new_conversions, 0) > 0
        THEN (COALESCE(meta.spend, 0) + COALESCE(tiktok.spend, 0) + COALESCE(newsbreak.spend, 0)) / orders.new_conversions
        ELSE 0 END`;
      break;
    case 'aov':
      needs.add('orders');
      expr = `CASE WHEN COALESCE(orders.conversions, 0) > 0
        THEN COALESCE(orders.revenue, 0) / orders.conversions
        ELSE 0 END`;
      break;
    case 'pixel_sessions':
      needs.add('pixel');
      expr = 'COALESCE(pixel.sessions, 0)';
      break;
    case 'pixel_visitors':
      needs.add('pixel');
      expr = 'COALESCE(pixel.visitors, 0)';
      break;
    case 'pixel_page_views':
      needs.add('pixel');
      expr = 'COALESCE(pixel.page_views, 0)';
      break;
    default:
      expr = '0';
  }

  return { expr, needs };
}

export async function getCorrelationData(
  userId: number,
  metricX: string,
  metricY: string,
  startDate: string,
  endDate: string,
  _granularity: Granularity = 'day',
): Promise<CorrelationResult> {
  const xMeta = metricSQL(metricX);
  const yMeta = metricSQL(metricY);
  const allNeeds = new Set([...xMeta.needs, ...yMeta.needs]);

  // Build CTEs for only the data sources we need
  const ctes: string[] = [];
  const dateFilter = 'archived_date >= $1::DATE AND archived_date <= $2::DATE';
  const uf = 'AND user_id = $3';
  const params = [startDate, endDate, userId];

  // Date spine CTE so we get all dates even if some sources have gaps
  ctes.push(`date_spine AS (
    SELECT generate_series($1::DATE, $2::DATE, '1 day'::INTERVAL)::DATE AS date
  )`);

  if (allNeeds.has('meta')) {
    ctes.push(`meta AS (
      SELECT archived_date AS date,
        COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend,
        COALESCE(SUM((ad_data->>'conversion_value')::NUMERIC), 0) AS conversion_value,
        COALESCE(SUM((ad_data->>'conversions')::NUMERIC), 0) AS conversions
      FROM fb_ads_archive WHERE ${dateFilter} ${uf}
      GROUP BY archived_date
    )`);
  }

  if (allNeeds.has('tiktok')) {
    ctes.push(`tiktok AS (
      SELECT archived_date AS date,
        COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend,
        COALESCE(SUM((ad_data->>'conversion_value')::NUMERIC), 0) AS conversion_value,
        COALESCE(SUM((ad_data->>'conversions')::NUMERIC), 0) AS conversions
      FROM tiktok_ads_archive WHERE ${dateFilter} ${uf}
      GROUP BY archived_date
    )`);
  }

  if (allNeeds.has('newsbreak')) {
    ctes.push(`newsbreak AS (
      SELECT archived_date AS date,
        COALESCE(SUM((ad_data->>'spend')::NUMERIC), 0) AS spend,
        COALESCE(SUM((ad_data->>'conversion_value')::NUMERIC), 0) AS conversion_value,
        COALESCE(SUM((ad_data->>'conversions')::NUMERIC), 0) AS conversions
      FROM newsbreak_ads_archive WHERE ${dateFilter} ${uf}
      GROUP BY archived_date
    )`);
  }

  if (allNeeds.has('orders')) {
    ctes.push(`orders AS (
      SELECT archived_date AS date,
        COALESCE(SUM(
          CASE WHEN order_data->>'order_status' = 'completed'
            AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
          THEN COALESCE((order_data->>'subtotal')::NUMERIC, (order_data->>'revenue')::NUMERIC) ELSE 0 END
        ), 0) AS revenue,
        COUNT(DISTINCT CASE WHEN order_data->>'order_status' = 'completed'
          AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
          THEN order_data->>'order_id' END) AS conversions,
        COALESCE(SUM(
          CASE WHEN order_data->>'order_status' = 'completed'
            AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
            AND COALESCE((order_data->>'new_customer')::BOOLEAN, false) = true
          THEN COALESCE((order_data->>'subtotal')::NUMERIC, (order_data->>'revenue')::NUMERIC) ELSE 0 END
        ), 0) AS new_revenue,
        COUNT(DISTINCT CASE WHEN order_data->>'order_status' = 'completed'
          AND COALESCE((order_data->>'is_test')::BOOLEAN, false) = false
          AND COALESCE((order_data->>'new_customer')::BOOLEAN, false) = true
          THEN order_data->>'order_id' END) AS new_conversions
      FROM orders_archive WHERE ${dateFilter} ${uf}
      GROUP BY archived_date
    )`);
  }

  if (allNeeds.has('pixel')) {
    ctes.push(`pixel AS (
      SELECT
        created_at::DATE AS date,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(DISTINCT visitor_id) AS visitors,
        COUNT(*) FILTER (WHERE event_name = 'PageView') AS page_views
      FROM pixel_events_v2
      WHERE created_at::DATE >= $1::DATE AND created_at::DATE <= $2::DATE AND user_id = $3
      GROUP BY created_at::DATE
    )`);
  }

  // Build joins
  const joins: string[] = [];
  for (const need of allNeeds) {
    joins.push(`LEFT JOIN ${need} ON ${need}.date = d.date`);
  }

  const query = `
    WITH ${ctes.join(',\n')}
    SELECT
      d.date,
      (${xMeta.expr})::NUMERIC AS x_val,
      (${yMeta.expr})::NUMERIC AS y_val
    FROM date_spine d
    ${joins.join('\n')}
    ORDER BY d.date ASC
  `;

  const result = await pool.query(query, params);

  const points: CorrelationPoint[] = result.rows.map((r) => ({
    date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date).split('T')[0],
    x: parseFloat(r.x_val) || 0,
    y: parseFloat(r.y_val) || 0,
  }));

  // Filter out points where both values are 0 (no data)
  const nonZeroPoints = points.filter((p) => p.x !== 0 || p.y !== 0);
  const dataPoints = nonZeroPoints.length >= 3 ? nonZeroPoints : points;

  const xValues = dataPoints.map((p) => p.x);
  const yValues = dataPoints.map((p) => p.y);

  const pearsonR = calculatePearson(xValues, yValues);
  const { slope, intercept } = calculateLinearRegression(xValues, yValues);
  const pValue = approximatePValue(pearsonR, dataPoints.length);
  const interpretation = classifyCorrelation(pearsonR);
  const interpretationText = generateInterpretation(
    metricX,
    metricY,
    pearsonR,
    slope,
    interpretation,
    dataPoints,
  );

  return {
    points,
    pearsonR: parseFloat(pearsonR.toFixed(4)),
    pValue: parseFloat(pValue.toFixed(6)),
    slope: parseFloat(slope.toFixed(4)),
    intercept: parseFloat(intercept.toFixed(4)),
    interpretation,
    interpretationText,
  };
}
